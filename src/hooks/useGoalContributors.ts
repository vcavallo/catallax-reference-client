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
