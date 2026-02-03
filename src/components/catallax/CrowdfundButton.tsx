import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Zap } from 'lucide-react';
import { type TaskProposal } from '@/lib/catallax';
import { ZapDialog } from './ZapDialog';
import { LightningPaymentDialog } from './LightningPaymentDialog';
import { CATALLAX_KINDS } from '@/lib/catallax';

interface CrowdfundButtonProps {
  task: TaskProposal;
  realZapsEnabled?: boolean;
  className?: string;
  /** Called when a payment is successfully completed */
  onPaymentComplete?: () => void;
}

export function CrowdfundButton({ task, realZapsEnabled = false, className, onPaymentComplete }: CrowdfundButtonProps) {
  const { user } = useCurrentUser();
  const [showZapDialog, setShowZapDialog] = useState(false);

  if (!user || !task.arbiterPubkey || !task.goalId) return null;

  // Only show for crowdfunded tasks that are still in proposed status
  if (task.fundingType !== 'crowdfunding' || task.status !== 'proposed') return null;

  const handlePaymentComplete = () => {
    setShowZapDialog(false);
    onPaymentComplete?.();
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => setShowZapDialog(true)}
        className={className}
      >
        <Zap className="h-4 w-4 mr-1" />
        Contribute
      </Button>

      {realZapsEnabled ? (
        <LightningPaymentDialog
          open={showZapDialog}
          onOpenChange={setShowZapDialog}
          recipientPubkey={task.arbiterPubkey}
          amount={parseInt(task.amount)}
          purpose={`Crowdfunding contribution for: ${task.content.title}`}
          onPaymentComplete={handlePaymentComplete}
          eventReference={`${CATALLAX_KINDS.TASK_PROPOSAL}:${task.patronPubkey}:${task.d}`}
          goalId={task.goalId}
        />
      ) : (
        <ZapDialog
          open={showZapDialog}
          onOpenChange={setShowZapDialog}
          recipientPubkey={task.arbiterPubkey}
          amount={parseInt(task.amount)}
          purpose={`Crowdfunding contribution for: ${task.content.title}`}
          onZapComplete={handlePaymentComplete}
        />
      )}
    </>
  );
}
