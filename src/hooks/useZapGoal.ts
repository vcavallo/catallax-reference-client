import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { calculateGoalProgress, type GoalProgress } from '@/lib/catallax';
import type { NostrEvent } from '@nostrify/nostrify';

interface ZapGoalData {
  goal: NostrEvent;
  receipts: NostrEvent[];
  progress: GoalProgress;
}

export function useZapGoal(goalId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ZapGoalData | null>({
    queryKey: ['zap-goal', goalId],
    queryFn: async (c) => {
      if (!goalId) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);

      // Fetch goal event first
      const goals = await nostr.query([{ ids: [goalId], kinds: [9041] }], { signal });
      const goal = goals[0];
      if (!goal) return null;

      // Extract the goal's linked event reference (e tag) if any
      const linkedEventId = goal.tags.find(([name]) => name === 'e')?.[1];
      // Extract the goal's linked addressable event (a tag) if any
      const linkedAddress = goal.tags.find(([name]) => name === 'a')?.[1];

      // Query for zap receipts that reference the goal directly
      const queries: Parameters<typeof nostr.query>[0] = [
        { kinds: [9735], '#e': [goalId], limit: 500 },
      ];

      // Also query for receipts referencing the linked event (task event ID)
      if (linkedEventId) {
        queries.push({ kinds: [9735], '#e': [linkedEventId], limit: 500 });
      }

      // Also query for receipts referencing the linked addressable event (task naddr)
      if (linkedAddress) {
        queries.push({ kinds: [9735], '#a': [linkedAddress], limit: 500 });
      }

      const receipts = await nostr.query(queries, { signal });

      // Deduplicate receipts by event ID
      const seen = new Set<string>();
      const uniqueReceipts = receipts.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      return {
        goal,
        receipts: uniqueReceipts,
        progress: calculateGoalProgress(goal, uniqueReceipts),
      };
    },
    enabled: !!goalId,
    staleTime: 30000, // 30 seconds - balance freshness vs relay load
    refetchOnWindowFocus: true,
  });
}
