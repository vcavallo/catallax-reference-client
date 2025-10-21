import { useState } from 'react';
import { useZap, getLightningAddressFromNip05 } from '@/hooks/useZap';
import { useAuthor } from '@/hooks/useAuthor';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { genUserName } from '@/lib/genUserName';
import { formatSats } from '@/lib/catallax';

interface ZapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientPubkey: string;
  amount: number; // in sats
  purpose: string;
  onZapComplete: (zapReceiptId: string) => void;
  onZapError?: (error: string) => void;
}

export function ZapDialog({
  open,
  onOpenChange,
  recipientPubkey,
  amount,
  purpose,
  onZapComplete,
  onZapError,
}: ZapDialogProps) {
  const { sendZap, isZapping } = useZap();
  const author = useAuthor(recipientPubkey);
  const metadata = author.data?.metadata;

  const [comment, setComment] = useState('');
  const [customAmount, setCustomAmount] = useState(amount.toString());
  const [lightningAddress, setLightningAddress] = useState('');
  const [zapComplete, setZapComplete] = useState(false);

  const displayName = metadata?.name ?? genUserName(recipientPubkey);
  const profileImage = metadata?.picture;
  const nip05 = metadata?.nip05;
  const lud16 = metadata?.lud16;

  // Try to get Lightning address from metadata
  const defaultLightningAddress = lud16 || getLightningAddressFromNip05(nip05 || '') || '';

  const handleZap = async () => {
    try {
      const zapAmount = parseInt(customAmount);
      if (isNaN(zapAmount) || zapAmount <= 0) {
        onZapError?.('Invalid amount');
        return;
      }

      if (!lightningAddress && !defaultLightningAddress) {
        onZapError?.('No Lightning address available for recipient');
        return;
      }

      const result = await sendZap({
        recipientPubkey: recipientPubkey,
        amount: zapAmount,
        comment: comment || purpose,
        lightningAddress: lightningAddress || defaultLightningAddress,
      });

      setZapComplete(true);
      onZapComplete(result.zapReceiptId);

      // Auto-close after success
      setTimeout(() => {
        onOpenChange(false);
        setZapComplete(false);
        setComment('');
        setCustomAmount(amount.toString());
        setLightningAddress('');
      }, 2000);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send zap';
      onZapError?.(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Send Lightning Payment
          </DialogTitle>
          <DialogDescription>
            {purpose}
          </DialogDescription>
        </DialogHeader>

        {/* Demo Warning */}
        <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800 dark:text-orange-200">
            <strong>⚠️ DEMO MODE:</strong> This is a simulated Lightning payment for testing purposes.
            No real Bitcoin will be sent. In production, this would integrate with WebLN or show a Lightning invoice QR code.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          {/* Recipient Info */}
          <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profileImage} alt={displayName} />
              <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{displayName}</p>
              <p className="text-sm text-muted-foreground">
                {defaultLightningAddress || 'No Lightning address found'}
              </p>
            </div>
          </div>

          {/* Lightning Address Override */}
          {!defaultLightningAddress && (
            <div className="space-y-2">
              <Label htmlFor="lightningAddress">Lightning Address</Label>
              <Input
                id="lightningAddress"
                value={lightningAddress}
                onChange={(e) => setLightningAddress(e.target.value)}
                placeholder="user@domain.com or LNURL..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the recipient's Lightning address or LNURL
              </p>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (sats)</Label>
            <Input
              id="amount"
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              min="1"
            />
            <p className="text-sm text-muted-foreground">
              Suggested: {formatSats(amount)}
            </p>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="comment">Comment (Optional)</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={purpose}
              rows={2}
            />
          </div>

          {/* Warnings */}
          {!defaultLightningAddress && !lightningAddress && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No Lightning address found for this user. You'll need to enter one manually.
              </AlertDescription>
            </Alert>
          )}

          {/* Success State */}
          {zapComplete && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Payment sent successfully! The task will be updated automatically.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isZapping}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleZap}
              disabled={isZapping || zapComplete || (!defaultLightningAddress && !lightningAddress)}
              className="flex-1"
            >
              {isZapping ? (
                <>
                  <Zap className="h-4 w-4 mr-2 animate-pulse" />
                  Sending...
                </>
              ) : zapComplete ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Sent!
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Send {formatSats(parseInt(customAmount) || amount)}
                </>
              )}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center">
            <p>⚡ This will create a Lightning payment to fund the escrow</p>
            <p>The task status will update automatically when payment is confirmed</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}