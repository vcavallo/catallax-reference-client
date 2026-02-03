import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Zap } from 'lucide-react';
import { formatSats, type TaskProposal } from '@/lib/catallax';
import { ZapDialog } from './ZapDialog';
import { LightningPaymentDialog } from './LightningPaymentDialog';
import { CATALLAX_KINDS } from '@/lib/catallax';

interface CrowdfundButtonProps {
  task: TaskProposal;
  realZapsEnabled?: boolean;
  className?: string;
}

export function CrowdfundButton({ task, realZapsEnabled = false, className }: CrowdfundButtonProps) {
  const { user } = useCurrentUser();
  const [showZapDialog, setShowZapDialog] = useState(false);

  if (!user || !task.arbiterPubkey || !task.goalId) return null;

  // Only show for crowdfunded tasks that are still in proposed status
  if (task.fundingType !== 'crowdfunding' || task.status !== 'proposed') return null;

  return (
    <>
      <Button
        size="sm"
        onClick={() => setShowZapDialog(true)}
        className={className}
      >
        <Zap className="h-4 w-4 mr-1" />
        Fund ({formatSats(task.amount)})
      </Button>

      {realZapsEnabled ? (
        <LightningPaymentDialog
          open={showZapDialog}
          onOpenChange={setShowZapDialog}
          recipientPubkey={task.arbiterPubkey}
          amount={parseInt(task.amount)}
          purpose={`Crowdfunding contribution for: ${task.content.title}`}
          onPaymentComplete={() => setShowZapDialog(false)}
          eventReference={`${CATALLAX_KINDS.TASK_PROPOSAL}:${task.patronPubkey}:${task.d}`}
        />
      ) : (
        <ZapDialog
          open={showZapDialog}
          onOpenChange={setShowZapDialog}
          recipientPubkey={task.arbiterPubkey}
          amount={parseInt(task.amount)}
          purpose={`Crowdfunding contribution for: ${task.content.title}`}
          onZapComplete={() => setShowZapDialog(false)}
        />
      )}
    </>
  );
}
