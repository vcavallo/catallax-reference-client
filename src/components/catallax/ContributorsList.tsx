import { useState } from 'react';
import { useZapGoal } from '@/hooks/useZapGoal';
import { useAuthor } from '@/hooks/useAuthor';
import { formatSats, type GoalContributor, type RefundSplit } from '@/lib/catallax';
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

interface ContributorsListProps {
  goalId: string;
  refundSplits?: RefundSplit[];
  showRefunds?: boolean;
  className?: string;
}

export function ContributorsList({
  goalId,
  refundSplits,
  showRefunds = false,
  className,
}: ContributorsListProps) {
  const { data, isLoading } = useZapGoal(goalId);
  const contributors = data?.progress.contributors ?? [];
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

  const refundMap = new Map(refundSplits?.map((r) => [r.recipientPubkey, r]) ?? []);

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
          <>
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
          </>
        )}
      </Collapsible>
    </div>
  );
}

function ContributorRow({
  contributor,
  refund,
  showRefund,
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
