import { useState } from 'react';
import { useZap, getLightningAddressFromNip05 } from '@/hooks/useZap';
import { useRealZap } from '@/hooks/useRealZap';
import { useAuthor } from '@/hooks/useAuthor';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, CheckCircle, Users } from 'lucide-react';
import { genUserName } from '@/lib/genUserName';
import { formatSats, type PaymentSplit } from '@/lib/catallax';

interface ZapSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splits: PaymentSplit[];
  purpose: string;
  onZapComplete: (zapReceiptId: string) => void;
  onZapError?: (error: string) => void;
  realZapsEnabled?: boolean;
}

export function ZapSplitDialog({
  open,
  onOpenChange,
  splits,
  purpose,
  onZapComplete,
  onZapError,
  realZapsEnabled = false,
}: ZapSplitDialogProps) {
  const { sendZap: sendDemoZap, isZapping: isDemoZapping } = useZap();
  const { sendZap: sendRealZap, isZapping: isRealZapping } = useRealZap();

  const sendZap = realZapsEnabled ? sendRealZap : sendDemoZap;
  const isZapping = realZapsEnabled ? isRealZapping : isDemoZapping;

  const [comment, setComment] = useState('');
  const [lightningAddresses, setLightningAddresses] = useState<Record<string, string>>({});
  const [zapComplete, setZapComplete] = useState(false);

  const totalAmount = splits.reduce((sum, split) => sum + split.amount, 0);
  const primaryRecipient = splits.find(split => split.weight === Math.max(...splits.map(s => s.weight)));

  const handleZap = async () => {
    if (!primaryRecipient) return;

    // For now, we'll send to the primary recipient with zap tags for splits
    // This requires the recipient's lightning service to support zap splits
    const primaryLightningAddress = lightningAddresses[primaryRecipient.recipientPubkey];

    if (!primaryLightningAddress) {
      onZapError?.('Lightning address required for primary recipient');
      return;
    }

    try {
      // Create zap tags for the split
      const zapTags = splits.map(split => [
        'zap',
        split.recipientPubkey,
        '', // relay hint (optional)
        split.weight.toString()
      ]);

      console.log('ZapSplitDialog: Creating payment with splits:', splits);
      console.log('ZapSplitDialog: Generated zap tags:', zapTags);
      console.log('ZapSplitDialog: Total amount:', totalAmount);

      const result = await sendZap({
        recipientPubkey: primaryRecipient.recipientPubkey,
        amount: totalAmount,
        comment,
        lightningAddress: primaryLightningAddress,
        zapTags,
      });

      setZapComplete(true);
      onZapComplete(result.zapReceiptId);
    } catch (error) {
      console.error('Zap failed:', error);
      onZapError?.(error instanceof Error ? error.message : 'Zap failed');
    }
  };

  const handleClose = () => {
    setZapComplete(false);
    setComment('');
    setLightningAddresses({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Split Payment
            {!realZapsEnabled && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                DEMO
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {purpose}
          </DialogDescription>
        </DialogHeader>

        {zapComplete ? (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Payment sent successfully! The funds will be split between recipients.
              </AlertDescription>
            </Alert>
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Payment Split Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Payment Breakdown</CardTitle>
                <CardDescription>
                  Total: {formatSats(totalAmount)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {splits.map((split) => (
                  <RecipientCard
                    key={split.recipientPubkey}
                    split={split}
                    splits={splits}
                    lightningAddress={lightningAddresses[split.recipientPubkey] || ''}
                    onLightningAddressChange={(address) =>
                      setLightningAddresses(prev => ({
                        ...prev,
                        [split.recipientPubkey]: address
                      }))
                    }
                    isPrimary={split === primaryRecipient}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="comment">Comment (optional)</Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment to the payment..."
                rows={2}
              />
            </div>

            {/* Information about zap splits */}
            <Alert>
              <Zap className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>⚡ Zap Split Payment:</strong> This payment will be automatically split between recipients using NIP-57 zap splits.
                Works with both WebLN wallets and QR code payments.
                {splits.length === 2 && (
                  <>
                    <br /><br />
                    <strong>Breakdown:</strong> Task amount + Arbiter fee = Total payment
                  </>
                )}
                <br /><br />
                <strong>How it works:</strong> The primary recipient's Lightning service will automatically distribute the funds according to the split configuration.
              </AlertDescription>
            </Alert>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleZap}
                disabled={isZapping || !primaryRecipient || !lightningAddresses[primaryRecipient.recipientPubkey]}
                className="flex-1"
              >
                {isZapping ? (
                  <>
                    <Zap className="h-4 w-4 mr-2 animate-pulse" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Send {formatSats(totalAmount)}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface RecipientCardProps {
  split: PaymentSplit;
  splits: PaymentSplit[];
  lightningAddress: string;
  onLightningAddressChange: (address: string) => void;
  isPrimary: boolean;
}

function RecipientCard({ split, splits, lightningAddress, onLightningAddressChange, isPrimary }: RecipientCardProps) {
  const author = useAuthor(split.recipientPubkey);
  const metadata = author.data?.metadata;

  const displayName = metadata?.name ?? genUserName(split.recipientPubkey);
  const profileImage = metadata?.picture;
  const nip05 = metadata?.nip05;
  const lud16 = metadata?.lud16;

  // Try to get Lightning address from metadata
  const defaultLightningAddress = lud16 || getLightningAddressFromNip05(nip05 || '') || '';

  // Auto-populate if we have a default address and field is empty
  if (defaultLightningAddress && !lightningAddress) {
    onLightningAddressChange(defaultLightningAddress);
  }

  const totalAmount = splits.reduce((sum, s) => sum + s.amount, 0);
  const percentage = Math.round((split.amount / totalAmount) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={profileImage} alt={displayName} />
          <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{displayName}</p>
            {isPrimary && (
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                Primary
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatSats(split.amount)} ({percentage}%)
          </p>
        </div>
      </div>

      {isPrimary && (
        <div className="space-y-1">
          <Label htmlFor={`lightning-${split.recipientPubkey}`} className="text-xs">
            Lightning Address *
          </Label>
          <Input
            id={`lightning-${split.recipientPubkey}`}
            value={lightningAddress}
            onChange={(e) => onLightningAddressChange(e.target.value)}
            placeholder="user@domain.com or LNURL"
            className="text-xs"
            required
          />
        </div>
      )}


    </div>
  );
}