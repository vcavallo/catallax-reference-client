# Crowdfunding Implementation Guide

This document provides a detailed implementation roadmap for adding NIP-75 Zap Goal crowdfunding support to Catallax.

## Overview

The feature enables tasks to be funded by multiple contributors instead of a single patron. The arbiter holds the escrow (receives zaps to the goal), marks the task funded when the goal is met, and issues proportional refunds if work is rejected or the task is cancelled.

## Implementation Order

Build in this order to maintain a working system throughout development:

1. Protocol & Types
2. Data Layer (hooks, utilities)
3. UI Components (display-only first)
4. Publishing Actions
5. Zap Integration
6. Testing & Polish

---

## Phase 1: Protocol & Types

### 1.1 Update `src/lib/catallax.ts`

Add new types and extend existing interfaces:

```typescript
// Add to existing types
export type FundingType = 'single' | 'crowdfunding';
export type ResolutionType = 'successful' | 'rejected' | 'cancelled' | 'abandoned';

// Extend TaskProposal interface
export interface TaskProposal {
  // ... existing fields ...
  fundingType: FundingType;
  goalId?: string; // Kind 9041 event ID for crowdfunded tasks
}

// New interfaces
export interface GoalContributor {
  pubkey: string;
  zapReceiptId: string;
  amountSats: number;
  percentage: number;
  timestamp: number;
}

export interface GoalProgress {
  goalId: string;
  targetSats: number;
  raisedSats: number;
  percentComplete: number;
  isGoalMet: boolean;
  contributors: GoalContributor[];
}

export interface RefundSplit {
  recipientPubkey: string;
  amountSats: number;
  originalContribution: number;
  proportion: number;
}
```

### 1.2 Update `parseTaskProposal` function

Extract the new tags:

```typescript
export function parseTaskProposal(event: NostrEvent): TaskProposal | null {
  try {
    // ... existing parsing ...

    // NEW: Extract funding type (default to 'single' for backwards compatibility)
    const fundingType = (event.tags.find(([name]) => name === 'funding_type')?.[1] as FundingType) || 'single';

    // NEW: Extract goal reference for crowdfunded tasks
    const goalTag = event.tags.find(([name]) => name === 'goal');
    const goalId = goalTag?.[1];

    // Validation: crowdfunded tasks must have a goal
    if (fundingType === 'crowdfunding' && !goalId) {
      return null;
    }

    return {
      // ... existing fields ...
      fundingType,
      goalId,
    };
  } catch {
    return null;
  }
}
```

### 1.3 Add refund calculation utility

```typescript
export function calculateCrowdfundingRefunds(
  contributors: GoalContributor[],
  arbiter: ArbiterAnnouncement,
  taskAmount: number,
  refundType: 'rejected' | 'cancelled'
): RefundSplit[] {
  const totalRaised = contributors.reduce((sum, c) => sum + c.amountSats, 0);

  // For cancellation: full refunds, no arbiter fee
  // For rejection: arbiter keeps their fee
  const arbiterFee = refundType === 'cancelled'
    ? 0
    : calculateArbiterFee(taskAmount, arbiter.feeType, arbiter.feeAmount);

  const refundPool = totalRaised - arbiterFee;

  // Calculate each contributor's proportion of the ORIGINAL total raised
  // Then apply that proportion to the refund pool
  return contributors.map(c => {
    const proportion = c.amountSats / totalRaised;
    const refundAmount = Math.floor(refundPool * proportion);

    return {
      recipientPubkey: c.pubkey,
      amountSats: refundAmount,
      originalContribution: c.amountSats,
      proportion,
    };
  });
}
```

### 1.4 Add goal event builder

```typescript
export function buildGoalEventTags(
  task: { title: string; description: string; amount: string; d: string },
  patronPubkey: string,
  arbiterPubkey: string,
  relays: string[]
): string[][] {
  const targetMsats = (parseInt(task.amount) * 1000).toString();

  return [
    ['relays', ...relays],
    ['amount', targetMsats],
    ['summary', task.description.slice(0, 200)],
    ['a', `33401:${patronPubkey}:${task.d}`, relays[0] || ''],
    ['zap', arbiterPubkey, relays[0] || '', '1'],
    ['alt', `Crowdfunding goal for Catallax task: ${task.title}`],
  ];
}
```

### 1.5 Update NIP.md

Add documentation for the new tags and flows. Include:
- `funding_type` tag on Kind 33401
- `goal` tag on Kind 33401
- Kind 9041 usage for Catallax
- `refund` marker on `e` tags in Kind 3402
- `cancelled` resolution type

---

## Phase 2: Data Layer

### 2.1 Create `src/hooks/useZapGoal.ts`

```typescript
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { GoalProgress, GoalContributor } from '@/lib/catallax';

export function useZapGoal(goalId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['zap-goal', goalId],
    queryFn: async (c) => {
      if (!goalId) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      // Fetch goal event and its zap receipts in parallel-ish
      // Single query with multiple filters is more efficient
      const [goals, receipts] = await Promise.all([
        nostr.query([{ ids: [goalId], kinds: [9041] }], { signal }),
        nostr.query([{ kinds: [9735], '#e': [goalId], limit: 500 }], { signal }),
      ]);

      const goal = goals[0];
      if (!goal) return null;

      return {
        goal,
        receipts,
        progress: calculateGoalProgress(goal, receipts),
      };
    },
    enabled: !!goalId,
    staleTime: 30000, // 30 seconds - balance freshness vs relay load
  });
}

function calculateGoalProgress(goal: NostrEvent, receipts: NostrEvent[]): GoalProgress {
  // Parse target from goal
  const amountTag = goal.tags.find(([name]) => name === 'amount');
  const targetMsats = parseInt(amountTag?.[1] || '0');
  const targetSats = Math.floor(targetMsats / 1000);

  // Parse contributors from receipts
  const contributors: GoalContributor[] = [];
  let totalRaisedMsats = 0;

  for (const receipt of receipts) {
    // Get amount from bolt11 description or amount tag
    const amountMsats = parseZapReceiptAmount(receipt);
    if (amountMsats <= 0) continue;

    // Get sender pubkey from the embedded zap request
    const senderPubkey = parseZapReceiptSender(receipt);
    if (!senderPubkey) continue;

    totalRaisedMsats += amountMsats;

    // Check if this contributor already exists (aggregate multiple zaps)
    const existing = contributors.find(c => c.pubkey === senderPubkey);
    if (existing) {
      existing.amountSats += Math.floor(amountMsats / 1000);
    } else {
      contributors.push({
        pubkey: senderPubkey,
        zapReceiptId: receipt.id,
        amountSats: Math.floor(amountMsats / 1000),
        percentage: 0, // calculated below
        timestamp: receipt.created_at,
      });
    }
  }

  const raisedSats = Math.floor(totalRaisedMsats / 1000);

  // Calculate percentages
  for (const contributor of contributors) {
    contributor.percentage = raisedSats > 0 ? contributor.amountSats / raisedSats : 0;
  }

  // Sort by amount descending
  contributors.sort((a, b) => b.amountSats - a.amountSats);

  return {
    goalId: goal.id,
    targetSats,
    raisedSats,
    percentComplete: targetSats > 0 ? Math.min((raisedSats / targetSats) * 100, 100) : 0,
    isGoalMet: raisedSats >= targetSats,
    contributors,
  };
}

// Helper: Parse amount from zap receipt
function parseZapReceiptAmount(receipt: NostrEvent): number {
  // Try amount tag first (NIP-57)
  const amountTag = receipt.tags.find(([name]) => name === 'amount');
  if (amountTag?.[1]) {
    return parseInt(amountTag[1]);
  }

  // Fallback: parse from bolt11 in description tag
  // This is more complex - may need a bolt11 decoder library
  // For MVP, rely on amount tag being present
  return 0;
}

// Helper: Parse sender pubkey from zap receipt
function parseZapReceiptSender(receipt: NostrEvent): string | null {
  // The zap receipt contains the original zap request in the 'description' tag
  const descTag = receipt.tags.find(([name]) => name === 'description');
  if (!descTag?.[1]) return null;

  try {
    const zapRequest = JSON.parse(descTag[1]) as NostrEvent;
    return zapRequest.pubkey;
  } catch {
    return null;
  }
}
```

### 2.2 Create `src/hooks/useGoalContributors.ts`

This can be a simpler hook that just returns the contributors from `useZapGoal`:

```typescript
import { useZapGoal } from './useZapGoal';
import type { GoalContributor } from '@/lib/catallax';

export function useGoalContributors(goalId: string | undefined): {
  contributors: GoalContributor[];
  totalRaised: number;
  isLoading: boolean;
} {
  const { data, isLoading } = useZapGoal(goalId);

  return {
    contributors: data?.progress.contributors ?? [],
    totalRaised: data?.progress.raisedSats ?? 0,
    isLoading,
  };
}
```

### 2.3 Update `src/hooks/useCatallax.ts`

Add a hook for publishing the goal event:

```typescript
export function usePublishGoal() {
  const { mutateAsync: createEvent } = useNostrPublish();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async ({
      task,
      patronPubkey,
      arbiterPubkey,
    }: {
      task: { title: string; description: string; amount: string; d: string };
      patronPubkey: string;
      arbiterPubkey: string;
    }) => {
      const tags = buildGoalEventTags(
        task,
        patronPubkey,
        arbiterPubkey,
        [config.relayUrl]
      );

      return createEvent({
        kind: 9041,
        content: `Crowdfunding goal for: ${task.title}`,
        tags,
      });
    },
  });
}
```

---

## Phase 3: UI Components (Display)

### 3.1 Create `src/components/GoalProgressBar.tsx`

```typescript
import { Progress } from '@/components/ui/progress';
import { formatSats } from '@/lib/catallax';
import { useZapGoal } from '@/hooks/useZapGoal';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Zap, CheckCircle } from 'lucide-react';

interface GoalProgressBarProps {
  goalId: string;
  className?: string;
}

export function GoalProgressBar({ goalId, className }: GoalProgressBarProps) {
  const { data, isLoading } = useZapGoal(goalId);

  if (isLoading) {
    return (
      <div className={className}>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (!data) return null;

  const { progress } = data;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="font-medium">
          {formatSats(progress.raisedSats)} raised
        </span>
        <span className="text-muted-foreground">
          of {formatSats(progress.targetSats)} goal
        </span>
      </div>

      <Progress
        value={progress.percentComplete}
        className="h-2 mb-2"
      />

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {progress.contributors.length} contributor{progress.contributors.length !== 1 ? 's' : ''}
        </span>

        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          {Math.round(progress.percentComplete)}%
        </span>

        {progress.isGoalMet && (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle className="h-3 w-3" />
            Goal reached!
          </span>
        )}
      </div>
    </div>
  );
}
```

### 3.2 Create `src/components/ContributorsList.tsx`

```typescript
import { useGoalContributors } from '@/hooks/useGoalContributors';
import { useAuthor } from '@/hooks/useAuthor';
import { formatSats } from '@/lib/catallax';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { genUserName } from '@/lib/genUserName';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { GoalContributor, RefundSplit } from '@/lib/catallax';

interface ContributorsListProps {
  goalId: string;
  refundSplits?: RefundSplit[]; // For arbiter view showing refund amounts
  showRefunds?: boolean;
  className?: string;
}

export function ContributorsList({
  goalId,
  refundSplits,
  showRefunds = false,
  className
}: ContributorsListProps) {
  const { contributors, isLoading } = useGoalContributors(goalId);
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className={className}>
        <Skeleton className="h-12 w-full mb-2" />
        <Skeleton className="h-12 w-full mb-2" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (contributors.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        No contributions yet
      </div>
    );
  }

  const displayCount = 5;
  const hasMore = contributors.length > displayCount;
  const visibleContributors = isOpen ? contributors : contributors.slice(0, displayCount);

  // Map refund amounts to contributors if provided
  const refundMap = new Map(refundSplits?.map(r => [r.recipientPubkey, r]) ?? []);

  return (
    <div className={className}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="space-y-2">
          {visibleContributors.map((contributor) => (
            <ContributorRow
              key={contributor.pubkey}
              contributor={contributor}
              refund={refundMap.get(contributor.pubkey)}
              showRefund={showRefunds}
            />
          ))}
        </div>

        {hasMore && (
          <CollapsibleContent>
            <div className="space-y-2 mt-2">
              {contributors.slice(displayCount).map((contributor) => (
                <ContributorRow
                  key={contributor.pubkey}
                  contributor={contributor}
                  refund={refundMap.get(contributor.pubkey)}
                  showRefund={showRefunds}
                />
              ))}
            </div>
          </CollapsibleContent>
        )}

        {hasMore && (
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full mt-2">
              {isOpen ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Show {contributors.length - displayCount} more
                </>
              )}
            </Button>
          </CollapsibleTrigger>
        )}
      </Collapsible>
    </div>
  );
}

function ContributorRow({
  contributor,
  refund,
  showRefund
}: {
  contributor: GoalContributor;
  refund?: RefundSplit;
  showRefund: boolean;
}) {
  const author = useAuthor(contributor.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(contributor.pubkey);

  return (
    <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={metadata?.picture} />
          <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <div className="text-sm font-medium">{displayName}</div>
          <div className="text-xs text-muted-foreground">
            {(contributor.percentage * 100).toFixed(1)}% of total
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-medium">
          {formatSats(contributor.amountSats)}
        </div>
        {showRefund && refund && (
          <div className="text-xs text-muted-foreground">
            Refund: {formatSats(refund.amountSats)}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3.3 Update TaskCard to show funding type and progress

In your existing `TaskCard` component, add:

```typescript
// Inside the card, after status badge:
{task.fundingType === 'crowdfunding' && task.goalId && task.status === 'proposed' && (
  <GoalProgressBar goalId={task.goalId} className="mt-4" />
)}

// Add a badge for funding type:
{task.fundingType === 'crowdfunding' && (
  <Badge variant="outline" className="ml-2">
    <Users className="h-3 w-3 mr-1" />
    Crowdfunded
  </Badge>
)}
```

---

## Phase 4: Publishing Actions

### 4.1 Update TaskProposalForm

Add funding type selection. The key flow:

1. User selects "Crowdfunding"
2. Form requires arbiter to be selected first
3. On submit:
   - First, publish the Kind 9041 goal event
   - Then, publish the Kind 33401 task with `funding_type` and `goal` tags

```typescript
// In form state
const [fundingType, setFundingType] = useState<'single' | 'crowdfunding'>('single');

// In form JSX, after arbiter selection:
<div className="space-y-2">
  <Label>Funding Type</Label>
  <RadioGroup
    value={fundingType}
    onValueChange={(v) => setFundingType(v as 'single' | 'crowdfunding')}
    disabled={!selectedArbiter} // Require arbiter first
  >
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="single" id="single" />
      <Label htmlFor="single">Single Patron (you fund it)</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="crowdfunding" id="crowdfunding" />
      <Label htmlFor="crowdfunding">Crowdfunding (others contribute)</Label>
    </div>
  </RadioGroup>

  {fundingType === 'crowdfunding' && (
    <p className="text-sm text-muted-foreground">
      A funding goal will be created. Anyone can contribute via Lightning zaps.
      The arbiter will mark the task as funded once the goal is reached.
    </p>
  )}
</div>

// In submit handler:
const handleSubmit = async () => {
  let goalId: string | undefined;

  if (fundingType === 'crowdfunding') {
    // First, create the goal
    const goalEvent = await publishGoal({
      task: { title, description, amount, d: taskId },
      patronPubkey: user.pubkey,
      arbiterPubkey: selectedArbiter.arbiterPubkey,
    });
    goalId = goalEvent.id;
  }

  // Build task tags
  const tags = [
    ['d', taskId],
    ['p', user.pubkey],
    ['p', selectedArbiter.arbiterPubkey],
    ['a', `33400:${selectedArbiter.arbiterPubkey}:${selectedArbiter.d}`],
    ['amount', amount],
    ['status', 'proposed'],
    ['funding_type', fundingType],
    ['t', 'catallax'],
  ];

  if (goalId) {
    tags.push(['goal', goalId, config.relayUrl]);
  }

  await createEvent({
    kind: 33401,
    content: JSON.stringify({ title, description, requirements }),
    tags,
  });
};
```

### 4.2 Create ArbiterMarkFundedButton

```typescript
import { Button } from '@/components/ui/button';
import { useZapGoal } from '@/hooks/useZapGoal';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { CheckCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { TaskProposal } from '@/lib/catallax';

interface ArbiterMarkFundedButtonProps {
  task: TaskProposal;
  onSuccess?: () => void;
}

export function ArbiterMarkFundedButton({ task, onSuccess }: ArbiterMarkFundedButtonProps) {
  const { user } = useCurrentUser();
  const { data: goalData } = useZapGoal(task.goalId);
  const { mutateAsync: createEvent, isPending } = useNostrPublish();

  // Only show for arbiter, crowdfunded tasks, in proposed state, when goal is met
  if (!user) return null;
  if (user.pubkey !== task.arbiterPubkey) return null;
  if (task.fundingType !== 'crowdfunding') return null;
  if (task.status !== 'proposed') return null;
  if (!goalData?.progress.isGoalMet) return null;

  const handleMarkFunded = async () => {
    // Rebuild the task event with updated status
    const tags = [
      ['d', task.d],
      ['p', task.patronPubkey],
      ['p', task.arbiterPubkey],
      ...(task.workerPubkey ? [['p', task.workerPubkey]] : []),
      ['a', task.arbiterService!],
      ['amount', task.amount],
      ['status', 'funded'],
      ['funding_type', 'crowdfunding'],
      ['goal', task.goalId!, ''],
      ['t', 'catallax'],
      ...task.categories.filter(c => c !== 'catallax').map(c => ['t', c]),
    ];

    await createEvent({
      kind: 33401,
      content: JSON.stringify(task.content),
      tags,
    });

    onSuccess?.();
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="w-full">
          <CheckCircle className="h-4 w-4 mr-2" />
          Mark as Funded
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Funding</AlertDialogTitle>
          <AlertDialogDescription>
            The crowdfunding goal has been reached. By marking this task as funded,
            you confirm that you have received the contributions and are ready to
            hold the escrow.
            <br /><br />
            <strong>Raised:</strong> {goalData?.progress.raisedSats.toLocaleString()} sats
            <br />
            <strong>Contributors:</strong> {goalData?.progress.contributors.length}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleMarkFunded} disabled={isPending}>
            {isPending ? 'Confirming...' : 'Confirm Funded'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### 4.3 Create RefundWorkflow component

This is the most complex component. Build it in stages:

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ContributorsList } from './ContributorsList';
import { useGoalContributors } from '@/hooks/useGoalContributors';
import { useArbiterAnnouncement } from '@/hooks/useCatallax'; // You may need to create this
import { calculateCrowdfundingRefunds, formatSats } from '@/lib/catallax';
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { TaskProposal, RefundSplit } from '@/lib/catallax';

type RefundType = 'rejected' | 'cancelled';
type RefundStatus = 'pending' | 'processing' | 'success' | 'failed';

interface RefundState {
  pubkey: string;
  status: RefundStatus;
  receiptId?: string;
  error?: string;
}

interface RefundWorkflowProps {
  task: TaskProposal;
  onComplete: (receiptIds: string[], refundType: RefundType) => void;
}

export function RefundWorkflow({ task, onComplete }: RefundWorkflowProps) {
  const [refundType, setRefundType] = useState<RefundType>('rejected');
  const [isProcessing, setIsProcessing] = useState(false);
  const [refundStates, setRefundStates] = useState<RefundState[]>([]);

  const { contributors, totalRaised } = useGoalContributors(task.goalId);
  // Fetch arbiter details for fee calculation
  const { data: arbiter } = useArbiterAnnouncement(task.arbiterService);

  if (!arbiter || contributors.length === 0) {
    return <div>Loading...</div>;
  }

  const refundSplits = calculateCrowdfundingRefunds(
    contributors,
    arbiter,
    parseInt(task.amount),
    refundType
  );

  const totalRefunds = refundSplits.reduce((sum, r) => sum + r.amountSats, 0);
  const arbiterFee = totalRaised - totalRefunds;

  const completedCount = refundStates.filter(r => r.status === 'success').length;
  const failedCount = refundStates.filter(r => r.status === 'failed').length;
  const progress = (completedCount / contributors.length) * 100;

  const handleIssueRefunds = async () => {
    setIsProcessing(true);
    setRefundStates(contributors.map(c => ({ pubkey: c.pubkey, status: 'pending' })));

    const receiptIds: string[] = [];

    for (let i = 0; i < refundSplits.length; i++) {
      const split = refundSplits[i];

      // Update state to processing
      setRefundStates(prev => prev.map(r =>
        r.pubkey === split.recipientPubkey ? { ...r, status: 'processing' } : r
      ));

      try {
        // Issue the refund via Lightning zap
        // This uses your existing zap infrastructure
        const receiptId = await issueRefundZap(split.recipientPubkey, split.amountSats, task);

        receiptIds.push(receiptId);

        setRefundStates(prev => prev.map(r =>
          r.pubkey === split.recipientPubkey
            ? { ...r, status: 'success', receiptId }
            : r
        ));
      } catch (error) {
        setRefundStates(prev => prev.map(r =>
          r.pubkey === split.recipientPubkey
            ? { ...r, status: 'failed', error: String(error) }
            : r
        ));
      }
    }

    setIsProcessing(false);

    // If all succeeded, call onComplete
    if (receiptIds.length === refundSplits.length) {
      onComplete(receiptIds, refundType);
    }
  };

  const handleRetryFailed = async () => {
    const failed = refundStates.filter(r => r.status === 'failed');
    // Re-attempt failed refunds...
    // Similar logic to above but only for failed ones
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Issue Refunds</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Refund Type Selection */}
        <div className="space-y-2">
          <Label>Refund Reason</Label>
          <RadioGroup
            value={refundType}
            onValueChange={(v) => setRefundType(v as RefundType)}
            disabled={isProcessing}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="rejected" id="rejected" />
              <Label htmlFor="rejected" className="font-normal">
                Work Rejected (arbiter keeps {formatSats(arbiterFee)} fee)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="cancelled" id="cancelled" />
              <Label htmlFor="cancelled" className="font-normal">
                Task Cancelled (full refunds, no fee)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Summary */}
        <div className="p-3 bg-muted rounded-md space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Total Raised:</span>
            <span className="font-medium">{formatSats(totalRaised)}</span>
          </div>
          <div className="flex justify-between">
            <span>Arbiter Fee:</span>
            <span className="font-medium">{formatSats(arbiterFee)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 mt-1">
            <span>Total Refunds:</span>
            <span className="font-medium">{formatSats(totalRefunds)}</span>
          </div>
        </div>

        {/* Contributors with refund amounts */}
        <ContributorsList
          goalId={task.goalId!}
          refundSplits={refundSplits}
          showRefunds
        />

        {/* Progress during processing */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Processing refunds...</span>
              <span>{completedCount} / {contributors.length}</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Results */}
        {!isProcessing && refundStates.length > 0 && (
          <div className="space-y-2">
            {completedCount > 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  {completedCount} refund{completedCount !== 1 ? 's' : ''} issued successfully
                </AlertDescription>
              </Alert>
            )}
            {failedCount > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {failedCount} refund{failedCount !== 1 ? 's' : ''} failed
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleRetryFailed}
                    className="ml-2"
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Action Button */}
        {!isProcessing && refundStates.length === 0 && (
          <Button onClick={handleIssueRefunds} className="w-full">
            Issue {contributors.length} Refund{contributors.length !== 1 ? 's' : ''}
          </Button>
        )}

        {isProcessing && (
          <Button disabled className="w-full">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Helper function - implement using your existing zap infrastructure
async function issueRefundZap(
  recipientPubkey: string,
  amountSats: number,
  task: TaskProposal
): Promise<string> {
  // Use your existing useRealZap or useZap hook logic
  // Return the zap receipt ID
  throw new Error('Not implemented');
}
```

---

## Phase 5: Zap Integration

### 5.1 Goal Contribution Button

Create a button that opens your existing zap dialog but targets the goal event:

```typescript
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';
import { useState } from 'react';
// Import your existing zap dialog component

interface ContributeButtonProps {
  goalId: string;
  goalEvent: NostrEvent;
  minAmount?: number; // 100 sats minimum
}

export function ContributeButton({ goalId, goalEvent, minAmount = 100 }: ContributeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Zap className="h-4 w-4 mr-2" />
        Contribute
      </Button>

      {/* Your existing zap dialog, but:
          - Target the goal event (not a profile)
          - Include relay tags from the goal event
          - Enforce minimum amount of 100 sats
      */}
      <YourZapDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        targetEvent={goalEvent}
        minAmount={minAmount}
      />
    </>
  );
}
```

### 5.2 Modify Zap Dialog for Goals

Your existing zap dialog needs to handle zapping an event (the goal) rather than just a profile. Key changes:

1. Accept either a pubkey or an event as target
2. For event zaps, include the `e` tag in the zap request
3. Use the relays from the goal's `relays` tag
4. Enforce minimum amount for goal contributions

---

## Phase 6: Task Conclusion Updates

### 6.1 Extend TaskConclusionForm

When concluding a crowdfunded task that's being rejected/cancelled, the form needs to:

1. Detect it's a crowdfunded task
2. Show the RefundWorkflow component
3. Collect all refund receipt IDs
4. Include them in the Kind 3402 event

```typescript
// In TaskConclusionForm, when resolution is 'rejected' or 'cancelled':

if (task.fundingType === 'crowdfunding' && ['rejected', 'cancelled'].includes(resolution)) {
  return (
    <RefundWorkflow
      task={task}
      onComplete={(receiptIds, refundType) => {
        // Now publish the conclusion event with refund receipts
        publishConclusion(task, refundType, receiptIds);
      }}
    />
  );
}

// Build conclusion event tags:
const buildConclusionTags = (
  task: TaskProposal,
  resolution: string,
  payoutReceiptId?: string,
  refundReceiptIds?: string[]
) => {
  const tags: string[][] = [];

  if (task.fundingType === 'crowdfunding' && refundReceiptIds) {
    // Add each refund receipt with 'refund' marker
    for (const receiptId of refundReceiptIds) {
      tags.push(['e', receiptId, '', 'refund']);
    }
    // Add goal reference
    tags.push(['e', task.goalId!, '', 'goal']);
    tags.push(['funding_type', 'crowdfunding']);
  } else if (payoutReceiptId) {
    tags.push(['e', payoutReceiptId, '', 'payout']);
  }

  tags.push(['e', task.id, '', 'task']);
  tags.push(['p', task.patronPubkey]);
  tags.push(['p', task.arbiterPubkey!]);
  if (task.workerPubkey) tags.push(['p', task.workerPubkey]);
  tags.push(['resolution', resolution]);
  tags.push(['a', `33401:${task.patronPubkey}:${task.d}`]);

  return tags;
};
```

---

## Testing Checklist

### Protocol Tests
- [ ] Task with `funding_type: "single"` works exactly as before
- [ ] Task with `funding_type: "crowdfunding"` requires `goal` tag
- [ ] `parseTaskProposal` handles missing `funding_type` (defaults to single)

### Goal Tests
- [ ] Kind 9041 event is created correctly with proper tags
- [ ] Goal links back to task via `a` tag
- [ ] Zaps to goal are directed to arbiter via `zap` tag

### Progress Tracking Tests
- [ ] `useZapGoal` correctly aggregates zap receipts
- [ ] Multiple zaps from same user are aggregated
- [ ] Percentage calculations are correct
- [ ] Goal met detection works (raised >= target)

### UI Tests
- [ ] GoalProgressBar displays correctly
- [ ] ContributorsList shows all contributors
- [ ] Funding type selector works in form
- [ ] Crowdfunding option disabled without arbiter selected

### Arbiter Flow Tests
- [ ] Mark Funded button only shows when appropriate
- [ ] Marking funded updates task status correctly
- [ ] RefundWorkflow calculates correct amounts
- [ ] Rejected: arbiter fee deducted
- [ ] Cancelled: full refunds

### Edge Cases
- [ ] Goal exceeded (overage handled)
- [ ] Single contributor (100% refund)
- [ ] Many contributors (batching works)
- [ ] Minimum 100 sats enforced
- [ ] Failed refund retry works

---

## File Summary

New files to create:
- `src/hooks/useZapGoal.ts`
- `src/hooks/useGoalContributors.ts`
- `src/components/GoalProgressBar.tsx`
- `src/components/ContributorsList.tsx`
- `src/components/ArbiterMarkFundedButton.tsx`
- `src/components/RefundWorkflow.tsx`
- `src/components/ContributeButton.tsx`

Files to modify:
- `src/lib/catallax.ts` (types, utilities)
- `src/hooks/useCatallax.ts` (add usePublishGoal)
- `NIP.md` (protocol documentation)
- `TaskProposalForm.tsx` (funding type selection)
- `TaskCard.tsx` (show progress, badge)
- `TaskDetail.tsx` (show contributors)
- `TaskManagement.tsx` (arbiter controls)
- `TaskConclusionForm.tsx` (refund workflow integration)
- Your zap dialog component (support event zaps)
