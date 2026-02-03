import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';

import { useCatallaxInvalidation } from '@/hooks/useCatallax';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Zap, DollarSign, RefreshCw, Bug, AlertTriangle } from 'lucide-react';
import { CATALLAX_KINDS, formatSats, getStatusColor, calculatePaymentSplit, calculateArbiterFee, parseArbiterAnnouncement, type TaskProposal, type TaskStatus, type ArbiterAnnouncement } from '@/lib/catallax';
import { TaskConclusionForm } from './TaskConclusionForm';
import { ZapDialog } from './ZapDialog';
import { ZapSplitDialog } from './ZapSplitDialog';
import { LightningPaymentDialog } from './LightningPaymentDialog';

interface TaskManagementProps {
  task: TaskProposal;
  onUpdate?: () => void;
  realZapsEnabled?: boolean;
}

export function TaskManagement({ task, onUpdate, realZapsEnabled = false }: TaskManagementProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: createEvent, isPending } = useNostrPublish();
  const { toast } = useToast();
  const { invalidateAllCatallaxQueries } = useCatallaxInvalidation();

  // Fetch arbiter announcement to get fee information
  const { data: arbiterAnnouncement } = useQuery({
    queryKey: ['arbiter-announcement', task.arbiterService],
    queryFn: async (c) => {
      if (!task.arbiterService) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const [kind, pubkey, identifier] = task.arbiterService.split(':');

      const events = await nostr.query([{
        kinds: [parseInt(kind)],
        authors: [pubkey],
        '#d': [identifier],
        limit: 20, // Get multiple versions to find the latest
      }], { signal });

      if (events.length === 0) return null;

      // Parse all events and find the latest version
      const parsedAnnouncements = events
        .map(parseArbiterAnnouncement)
        .filter((announcement): announcement is ArbiterAnnouncement => announcement !== null);

      if (parsedAnnouncements.length === 0) return null;

      // For replaceable events, return the one with the latest created_at
      const latestAnnouncement = parsedAnnouncements.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest
      );

      return latestAnnouncement;
    },
    enabled: !!task.arbiterService,
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
  });


  const [workerPubkey, setWorkerPubkey] = useState('');
  const [showConclusionForm, setShowConclusionForm] = useState(false);
  const [showDebugConclusionForm, setShowDebugConclusionForm] = useState(false);
  const [showFundDialog, setShowFundDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [showRefundSplitDialog, setShowRefundSplitDialog] = useState(false);
  const [showPayoutSplitDialog, setShowPayoutSplitDialog] = useState(false);
  const [conclusionZapReceiptId, setConclusionZapReceiptId] = useState('');

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Please log in to manage tasks.</p>
        </CardContent>
      </Card>
    );
  }

  const isPatron = user.pubkey === task.patronPubkey;
  const isArbiter = user.pubkey === task.arbiterPubkey;
  const isWorker = user.pubkey === task.workerPubkey;

  if (!isPatron && !isArbiter && !isWorker) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            You are not authorized to manage this task.
          </p>
        </CardContent>
      </Card>
    );
  }

  const updateTaskStatus = (newStatus: TaskStatus, zapReceiptId?: string, workerPubkeyOverride?: string) => {
    const content = task.content;

    const tags: string[][] = [
      ['d', task.d],
      ['p', task.patronPubkey],
      ['amount', task.amount],
      ['t', 'catallax'],
      ['status', newStatus],
    ];

    if (task.arbiterPubkey) {
      tags.push(['p', task.arbiterPubkey]);
    }

    if (workerPubkeyOverride || task.workerPubkey) {
      tags.push(['p', workerPubkeyOverride || task.workerPubkey || '']);
    }

    if (task.arbiterService) {
      tags.push(['a', task.arbiterService]);
    }

    if (task.detailsUrl) {
      tags.push(['r', task.detailsUrl]);
    }

    if (task.zapReceiptId || zapReceiptId) {
      tags.push(['e', task.zapReceiptId || zapReceiptId || '', '', 'zap']);
    }

    // Add task categories
    task.categories.forEach(category => {
      if (category !== 'catallax') {
        tags.push(['t', category]);
      }
    });

    console.log('Publishing task update with tags:', tags);

    createEvent({
      kind: CATALLAX_KINDS.TASK_PROPOSAL,
      content: JSON.stringify(content),
      tags,
      created_at: Math.floor(Date.now() / 1000), // Ensure we use current timestamp
    }, {
      onSuccess: (event) => {
        console.log('Task update published successfully:', event);
        setWorkerPubkey('');

        toast({
          title: 'Worker Assigned!',
          description: `Worker has been assigned and task status updated to "in progress".`,
        });

        // Force immediate refetch of all task queries
        invalidateAllCatallaxQueries();

        // Add a small delay to allow queries to refetch, then call onUpdate
        setTimeout(() => {
          onUpdate?.();
        }, 1500);
      },
      onError: (error) => {
        console.error('Failed to publish task update:', error);
        toast({
          title: 'Error',
          description: 'Failed to update task. Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const updateTaskStatusWithoutWorker = (newStatus: TaskStatus, zapReceiptId?: string) => {
    const content = task.content;

    const tags: string[][] = [
      ['d', task.d],
      ['p', task.patronPubkey],
      ['amount', task.amount],
      ['t', 'catallax'],
      ['status', newStatus],
    ];

    if (task.arbiterPubkey) {
      tags.push(['p', task.arbiterPubkey]);
    }

    // Explicitly do NOT add worker pubkey - this removes the worker

    if (task.arbiterService) {
      tags.push(['a', task.arbiterService]);
    }

    if (task.detailsUrl) {
      tags.push(['r', task.detailsUrl]);
    }

    if (task.zapReceiptId || zapReceiptId) {
      tags.push(['e', task.zapReceiptId || zapReceiptId || '', '', 'zap']);
    }

    // Add task categories
    task.categories.forEach(category => {
      if (category !== 'catallax') {
        tags.push(['t', category]);
      }
    });

    console.log('Publishing task update without worker, tags:', tags);

    createEvent({
      kind: CATALLAX_KINDS.TASK_PROPOSAL,
      content: JSON.stringify(content),
      tags,
      created_at: Math.floor(Date.now() / 1000), // Ensure we use current timestamp
    }, {
      onSuccess: (event) => {
        console.log('Task update (worker removed) published successfully:', event);
        setWorkerPubkey('');

        toast({
          title: 'Worker Removed!',
          description: `Worker has been removed and task status updated to "funded".`,
        });

        // Force immediate refetch of all task queries
        invalidateAllCatallaxQueries();

        // Add a small delay to allow queries to refetch, then call onUpdate
        setTimeout(() => {
          onUpdate?.();
        }, 1500);
      },
      onError: (error) => {
        console.error('Failed to publish task update:', error);
        toast({
          title: 'Error',
          description: 'Failed to remove worker. Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const handleFundEscrow = (zapReceiptId: string) => {
    // Automatically update task status to "funded" after successful Lightning payment
    updateTaskStatus('funded', zapReceiptId);
    setShowFundDialog(false);

    toast({
      title: 'Task Funded!',
      description: 'Task status updated to "funded". You can now assign a worker.',
    });
  };

  const handleAssignWorker = () => {
    if (!workerPubkey) return;

    // Validate pubkey format (basic hex check)
    if (!/^[0-9a-fA-F]{64}$/.test(workerPubkey)) {
      toast({
        title: 'Invalid Public Key',
        description: 'Please enter a valid 64-character hex public key.',
        variant: 'destructive',
      });
      return;
    }

    // Show immediate feedback
    const isReassignment = !!task.workerPubkey;
    toast({
      title: isReassignment ? 'Reassigning Worker...' : 'Assigning Worker...',
      description: 'Publishing task update to the network.',
    });

    // Determine the appropriate status based on current status
    let newStatus: TaskStatus;
    if (task.status === 'funded') {
      newStatus = 'in_progress';
    } else {
      // Keep current status if already in progress or submitted
      newStatus = task.status;
    }

    updateTaskStatus(newStatus, undefined, workerPubkey);
  };

  const handleRemoveWorker = () => {
    toast({
      title: 'Removing Worker...',
      description: 'Publishing task update to the network.',
    });

    // Remove worker and set status back to funded
    updateTaskStatusWithoutWorker('funded');
  };

  const handleMarkSubmitted = () => {
    updateTaskStatus('submitted');
  };

  const handleRefundPatron = (zapReceiptId: string) => {
    setConclusionZapReceiptId(zapReceiptId);
    setShowRefundDialog(false);
    setShowRefundSplitDialog(false);
    setShowConclusionForm(true);
  };

  const handlePayWorker = (zapReceiptId: string) => {
    setConclusionZapReceiptId(zapReceiptId);
    setShowPayoutDialog(false);
    setShowPayoutSplitDialog(false);
    setShowConclusionForm(true);
  };

  const handlePayWorkerWithSplit = () => {
    if (arbiterAnnouncement) {
      setShowPayoutSplitDialog(true);
    } else {
      setShowPayoutDialog(true);
    }
  };

  const handleRefundPatronWithSplit = () => {
    if (arbiterAnnouncement) {
      setShowRefundSplitDialog(true);
    } else {
      setShowRefundDialog(true);
    }
  };

  const handleDebugCreateConclusion = () => {
    // For debug purposes, allow creating a conclusion without a zap receipt
    setConclusionZapReceiptId('');
    setShowDebugConclusionForm(true);
  };

  if (showConclusionForm || showDebugConclusionForm) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => {
            setShowConclusionForm(false);
            setShowDebugConclusionForm(false);
          }}
        >
          ← Back to Management
        </Button>
        {showDebugConclusionForm && (
          <Alert>
            <Bug className="h-4 w-4" />
            <AlertDescription>
              <strong>Debug Mode:</strong> Creating a conclusion event for a task that is already marked as "concluded".
              This is for fixing tasks that have status updates but missing conclusion events.
            </AlertDescription>
          </Alert>
        )}
        <TaskConclusionForm
          task={task}
          payoutZapReceiptId={conclusionZapReceiptId}
          onSuccess={() => {
            setShowConclusionForm(false);
            setShowDebugConclusionForm(false);
            setConclusionZapReceiptId('');
            onUpdate?.();
          }}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Manage Task</CardTitle>
            <CardDescription>{task.content.title}</CardDescription>
          </div>
          <Badge className={getStatusColor(task.status)}>
            {task.status.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Amount:</span>
            <p>{formatSats(task.amount)}</p>
          </div>
          <div>
            <span className="font-medium">Status:</span>
            <p className="capitalize">{task.status.replace('_', ' ')}</p>
          </div>
          {task.workerPubkey && (
            <div className="md:col-span-2">
              <span className="font-medium">Worker:</span>
              <p className="font-mono text-xs">{task.workerPubkey}</p>
            </div>
          )}
        </div>

        <Separator />

        {/* Patron Actions */}
        {isPatron && (
          <div className="space-y-4">
            <h4 className="font-medium">Patron Actions</h4>

            {task.status === 'proposed' && task.arbiterPubkey && (
              <div className="space-y-3">
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Fund Escrow:</strong> Click to send Lightning payment to the arbiter.
                    Task status will automatically update to "funded" when payment completes.
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={() => setShowFundDialog(true)}
                  disabled={isPending}
                  className="w-full"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Fund Escrow ({formatSats(task.amount)})
                </Button>

                {/* Debug: Mark as funded if payment was already made */}
                <div className="pt-2 border-t border-dashed border-orange-200">
                  <Alert className="border-orange-200 bg-orange-50">
                    <Bug className="h-4 w-4 text-orange-600" />
                    <AlertDescription className="text-orange-800">
                      <strong>Already paid?</strong> If you already sent payment but the status didn't update,
                      enter the zap receipt ID below to mark this task as funded with proof of payment.
                    </AlertDescription>
                  </Alert>
                  <div className="mt-2 space-y-2">
                    <Input
                      id="manualZapReceipt"
                      placeholder="Zap receipt event ID (64 hex chars)"
                      className="font-mono text-xs"
                    />
                    <Button
                      onClick={() => {
                        const input = document.getElementById('manualZapReceipt') as HTMLInputElement;
                        const zapId = input?.value?.trim();
                        if (zapId && /^[0-9a-fA-F]{64}$/.test(zapId)) {
                          updateTaskStatus('funded', zapId);
                        } else if (!zapId) {
                          updateTaskStatus('funded');
                        } else {
                          toast({
                            title: 'Invalid ID',
                            description: 'Please enter a valid 64-character hex event ID, or leave empty.',
                            variant: 'destructive',
                          });
                        }
                      }}
                      disabled={isPending}
                      variant="outline"
                      className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
                    >
                      <Bug className="h-4 w-4 mr-2" />
                      Debug: Mark as Funded
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Worker Assignment - Available for funded, in_progress, and submitted statuses */}
            {(task.status === 'funded' || task.status === 'in_progress' || task.status === 'submitted' || task.zapReceiptId) && (
              <div className="space-y-3">
                <Alert>
                  <DollarSign className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Assign Worker:</strong> Enter the public key of the worker who will complete this task.
                    {task.status === 'funded' && ' This will update the task status to "in progress".'}
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="workerPubkey">
                    {task.workerPubkey ? 'Reassign Worker (Public Key)' : 'Assign Worker (Public Key)'}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="workerPubkey"
                      value={workerPubkey}
                      onChange={(e) => setWorkerPubkey(e.target.value)}
                      placeholder={task.workerPubkey || "Worker's public key (hex)"}
                    />
                    <Button
                      onClick={handleAssignWorker}
                      disabled={isPending || !workerPubkey}
                    >
                      {task.workerPubkey ? 'Reassign' : 'Assign'}
                    </Button>
                  </div>
                  {task.workerPubkey && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Current worker: {task.workerPubkey.slice(0, 16)}...
                    </p>
                  )}
                </div>

                {/* Add/Update Zap Receipt - Show if no zap receipt is linked */}
                {!task.zapReceiptId && (
                  <div className="pt-2 border-t border-dashed border-orange-200">
                    <Alert className="border-orange-200 bg-orange-50">
                      <Bug className="h-4 w-4 text-orange-600" />
                      <AlertDescription className="text-orange-800">
                        <strong>Missing zap receipt:</strong> Add the zap receipt ID to link proof of payment.
                      </AlertDescription>
                    </Alert>
                    <div className="mt-2 space-y-2">
                      <Input
                        id="addZapReceipt"
                        placeholder="Zap receipt event ID (64 hex chars)"
                        className="font-mono text-xs"
                      />
                      <Button
                        onClick={() => {
                          const input = document.getElementById('addZapReceipt') as HTMLInputElement;
                          const zapId = input?.value?.trim();
                          if (zapId && /^[0-9a-fA-F]{64}$/.test(zapId)) {
                            updateTaskStatus(task.status, zapId);
                            toast({
                              title: 'Zap Receipt Added',
                              description: 'Task updated with zap receipt reference.',
                            });
                          } else {
                            toast({
                              title: 'Invalid ID',
                              description: 'Please enter a valid 64-character hex event ID.',
                              variant: 'destructive',
                            });
                          }
                        }}
                        disabled={isPending}
                        variant="outline"
                        className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
                      >
                        <Bug className="h-4 w-4 mr-2" />
                        Add Zap Receipt
                      </Button>
                    </div>
                  </div>
                )}

                {/* Remove Worker - Only show if there's a worker assigned */}
                {task.workerPubkey && (
                  <div className="space-y-2">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Remove Worker:</strong> This will remove the current worker and set the task status back to "funded".
                      </AlertDescription>
                    </Alert>
                    <Button
                      onClick={handleRemoveWorker}
                      disabled={isPending}
                      variant="destructive"
                      className="w-full"
                    >
                      Remove Worker
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Show message if task is proposed but no arbiter */}
            {task.status === 'proposed' && !task.arbiterPubkey && (
              <Alert>
                <AlertDescription>
                  <strong>No Arbiter:</strong> You need to select an arbiter before you can fund the escrow and assign workers.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Worker Actions */}
        {isWorker && (
          <div className="space-y-4">
            <h4 className="font-medium">Worker Actions</h4>

            {task.status === 'in_progress' && (
              <Button
                onClick={handleMarkSubmitted}
                disabled={isPending}
              >
                Mark Work as Submitted
              </Button>
            )}
          </div>
        )}

        {/* Arbiter Actions */}
        {isArbiter && ['funded', 'in_progress', 'submitted'].includes(task.status) && (
          <div className="space-y-4">
            <Separator />
            <h4 className="font-medium">Arbiter Actions</h4>

            <Alert>
              <DollarSign className="h-4 w-4" />
              <AlertDescription>
                As the arbiter, you can either pay the worker (if work is satisfactory)
                or refund the patron (if work is unsatisfactory or task is cancelled).
                {arbiterAnnouncement && (
                  <>
                    <br /><br />
                    <strong>Fee Structure:</strong> Your {arbiterAnnouncement.feeType === 'flat' ? 'flat' : 'percentage'} fee of{' '}
                    {arbiterAnnouncement.feeType === 'flat'
                      ? formatSats(arbiterAnnouncement.feeAmount)
                      : `${(parseFloat(arbiterAnnouncement.feeAmount) * 100).toFixed(1)}%`
                    } will be paid in addition to the task amount.
                  </>
                )}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {task.workerPubkey && (
                <Button
                  onClick={handlePayWorkerWithSplit}
                  disabled={isPending}
                  className="w-full"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Pay Worker
                  {arbiterAnnouncement && (
                    <span className="ml-1 text-xs opacity-75">
                      ({formatSats(parseInt(task.amount) + calculateArbiterFee(parseInt(task.amount), arbiterAnnouncement.feeType, arbiterAnnouncement.feeAmount))})
                    </span>
                  )}
                </Button>
              )}

              <Button
                onClick={handleRefundPatronWithSplit}
                disabled={isPending}
                variant="outline"
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refund Patron
                {arbiterAnnouncement && (
                  <span className="ml-1 text-xs opacity-75">
                    ({formatSats(parseInt(task.amount) + calculateArbiterFee(parseInt(task.amount), arbiterAnnouncement.feeType, arbiterAnnouncement.feeAmount))})
                  </span>
                )}
              </Button>
            </div>

            {/* Remove Worker - Available to Arbiters */}
            {task.workerPubkey && (
              <div className="space-y-2">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Remove Worker:</strong> As the arbiter, you can remove the current worker and set the task status back to "funded".
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={handleRemoveWorker}
                  disabled={isPending}
                  variant="destructive"
                  className="w-full"
                >
                  Remove Worker
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Arbiter/Patron Conclusion Actions */}
        {(isArbiter || isPatron) && ['submitted', 'in_progress'].includes(task.status) && (
          <div className="space-y-4">
            <Separator />
            <div>
              <h4 className="font-medium mb-2">Conclude Task</h4>
              <Button
                onClick={() => setShowConclusionForm(true)}
                variant="outline"
              >
                Create Task Conclusion
              </Button>
            </div>
          </div>
        )}

        {/* Debug: Create Conclusion for Already Concluded Tasks */}
        {(isArbiter || isPatron) && task.status === 'concluded' && (
          <div className="space-y-4">
            <Separator />
            <div>
              <h4 className="font-medium mb-2 text-orange-600">Debug Actions</h4>
              <Alert className="mb-3">
                <Bug className="h-4 w-4" />
                <AlertDescription>
                  This task is marked as "concluded" but may be missing a conclusion event.
                  Use this debug function to create the missing conclusion event.
                </AlertDescription>
              </Alert>
              <Button
                onClick={handleDebugCreateConclusion}
                variant="outline"
                className="border-orange-200 text-orange-700 hover:bg-orange-50"
              >
                <Bug className="h-4 w-4 mr-2" />
                Debug: Create Additional Conclusion
              </Button>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p><strong>Note:</strong> Lightning payments will automatically update task status when confirmed.</p>
        </div>
      </CardContent>

      {/* Zap Split Dialogs */}
      {task.workerPubkey && arbiterAnnouncement && (
        <ZapSplitDialog
          open={showPayoutSplitDialog}
          onOpenChange={setShowPayoutSplitDialog}
          splits={calculatePaymentSplit(task, arbiterAnnouncement, task.workerPubkey, 'worker')}
          purpose={`Payment for completed work: ${task.content.title}`}
          onZapComplete={handlePayWorker}
          realZapsEnabled={realZapsEnabled}
        />
      )}

      {arbiterAnnouncement && (
        <ZapSplitDialog
          open={showRefundSplitDialog}
          onOpenChange={setShowRefundSplitDialog}
          splits={calculatePaymentSplit(task, arbiterAnnouncement, task.patronPubkey, 'patron')}
          purpose={`Refund for task: ${task.content.title}`}
          onZapComplete={handleRefundPatron}
          realZapsEnabled={realZapsEnabled}
        />
      )}

      {/* Payment Dialogs */}
      {task.arbiterPubkey && (
        realZapsEnabled ? (
          <LightningPaymentDialog
            open={showFundDialog}
            onOpenChange={setShowFundDialog}
            recipientPubkey={task.arbiterPubkey}
            amount={parseInt(task.amount)}
            purpose={`Escrow funding for task: ${task.content.title}`}
            onPaymentComplete={handleFundEscrow}
            eventReference={`${CATALLAX_KINDS.TASK_PROPOSAL}:${task.patronPubkey}:${task.d}`}
          />
        ) : (
          <ZapDialog
            open={showFundDialog}
            onOpenChange={setShowFundDialog}
            recipientPubkey={task.arbiterPubkey}
            amount={parseInt(task.amount)}
            purpose={`Escrow funding for task: ${task.content.title}`}
            onZapComplete={handleFundEscrow}
          />
        )
      )}

      {task.workerPubkey && (
        realZapsEnabled ? (
          <LightningPaymentDialog
            open={showPayoutDialog}
            onOpenChange={setShowPayoutDialog}
            recipientPubkey={task.workerPubkey}
            amount={parseInt(task.amount)}
            purpose={`Payment for completed work: ${task.content.title}`}
            onPaymentComplete={handlePayWorker}
            eventReference={`${CATALLAX_KINDS.TASK_PROPOSAL}:${task.patronPubkey}:${task.d}`}
          />
        ) : (
          <ZapDialog
            open={showPayoutDialog}
            onOpenChange={setShowPayoutDialog}
            recipientPubkey={task.workerPubkey}
            amount={parseInt(task.amount)}
            purpose={`Payment for completed work: ${task.content.title}`}
            onZapComplete={handlePayWorker}
          />
        )
      )}

      {realZapsEnabled ? (
        <LightningPaymentDialog
          open={showRefundDialog}
          onOpenChange={setShowRefundDialog}
          recipientPubkey={task.patronPubkey}
          amount={parseInt(task.amount)}
          purpose={`Refund for task: ${task.content.title}`}
          onPaymentComplete={handleRefundPatron}
          eventReference={`${CATALLAX_KINDS.TASK_PROPOSAL}:${task.patronPubkey}:${task.d}`}
        />
      ) : (
        <ZapDialog
          open={showRefundDialog}
          onOpenChange={setShowRefundDialog}
          recipientPubkey={task.patronPubkey}
          amount={parseInt(task.amount)}
          purpose={`Refund for task: ${task.content.title}`}
          onZapComplete={handleRefundPatron}
        />
      )}
    </Card>
  );
}