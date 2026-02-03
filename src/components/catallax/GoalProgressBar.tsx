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
