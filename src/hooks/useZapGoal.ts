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

      // Fetch goal event and its zap receipts in parallel
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
    refetchOnWindowFocus: true,
  });
}
