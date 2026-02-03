import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { formatSats } from '@/lib/catallax';
import { useZapGoal } from '@/hooks/useZapGoal';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Zap, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

interface GoalProgressBarProps {
  goalId: string;
  className?: string;
  /** When true, shows a loading state while waiting for payment to propagate */
  waitingForPayment?: boolean;
  /** Called when the waiting state should be cleared (data updated or timeout) */
  onWaitingComplete?: () => void;
}

const PAYMENT_TIMEOUT_MS = 45000;

export function GoalProgressBar({
  goalId,
  className,
  waitingForPayment = false,
  onWaitingComplete,
}: GoalProgressBarProps) {
  const { data, isLoading, isFetching } = useZapGoal(goalId);
  const [waitingTimedOut, setWaitingTimedOut] = useState(false);
  const [previousReceiptCount, setPreviousReceiptCount] = useState<number | null>(null);

  // Track receipt count changes to detect when payment has propagated
  useEffect(() => {
    if (data && waitingForPayment) {
      // Store the initial count when waiting starts
      if (previousReceiptCount === null) {
        setPreviousReceiptCount(data.receipts.length);
      }
      // If receipt count increased, payment has propagated
      else if (data.receipts.length > previousReceiptCount) {
        setPreviousReceiptCount(null);
        setWaitingTimedOut(false);
        onWaitingComplete?.();
      }
    }

    // Reset when not waiting
    if (!waitingForPayment) {
      setPreviousReceiptCount(null);
      setWaitingTimedOut(false);
    }
  }, [data, waitingForPayment, previousReceiptCount, onWaitingComplete]);

  // Timeout for waiting state
  useEffect(() => {
    if (waitingForPayment && !waitingTimedOut) {
      const timeout = setTimeout(() => {
        setWaitingTimedOut(true);
      }, PAYMENT_TIMEOUT_MS);

      return () => clearTimeout(timeout);
    }
  }, [waitingForPayment, waitingTimedOut]);

  // Show skeleton during initial load
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
  const showWaitingState = waitingForPayment && !waitingTimedOut;

  return (
    <div className={className}>
      {/* Waiting for payment propagation */}
      {showWaitingState && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Waiting for payment to confirm...</span>
        </div>
      )}

      {/* Timeout warning */}
      {waitingForPayment && waitingTimedOut && (
        <Alert variant="default" className="mb-2 py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            This is taking longer than expected... try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

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
        className={`h-2 mb-2 ${showWaitingState ? 'opacity-50' : ''}`}
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

        {isFetching && !isLoading && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
          </span>
        )}

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
