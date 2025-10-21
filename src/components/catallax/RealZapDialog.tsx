import { useState, useEffect } from 'react';
import { useRealZap, getLightningAddressFromMetadata } from '@/hooks/useRealZap';
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

interface RealZapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientPubkey: string;
  amount: number; // in sats
  purpose: string;
  onZapComplete: (zapReceiptId: string) => void;
  onZapError?: (error: string) => void;
}

export function RealZapDialog({
  open,
  onOpenChange,
  recipientPubkey,
  amount,
  purpose,
  onZapComplete,
  onZapError,
}: RealZapDialogProps) {
  const { sendZap, isZapping, checkWebLNSupport, isWebLNAvailable } = useRealZap();
  const author = useAuthor(recipientPubkey);
  const metadata = author.data?.metadata;

  const [comment, setComment] = useState('');
  const [customAmount, setCustomAmount] = useState(amount.toString());
  const [zapComplete, setZapComplete] = useState(false);
  const [webLNSupported, setWebLNSupported] = useState(false);

  const displayName = metadata?.name ?? genUserName(recipientPubkey);
  const profileImage = metadata?.picture;
  const lightningAddress = getLightningAddressFromMetadata(metadata);

  useEffect(() => {
    if (open && isWebLNAvailable) {
      checkWebLNSupport().then(setWebLNSupported);
    }
  }, [open, isWebLNAvailable, checkWebLNSupport]);

  const handleZap = async () => {
    try {
      const zapAmount = parseInt(customAmount);
      if (isNaN(zapAmount) || zapAmount <= 0) {
        onZapError?.('Invalid amount');
        return;
      }

      if (zapAmount < 1) {
        onZapError?.('Minimum zap amount is 1 sat');
        return;
      }

      const result = await sendZap({
        recipientPubkey: recipientPubkey,
        amount: zapAmount,
        comment: comment || purpose,
      });

      setZapComplete(true);
      onZapComplete(result.zapReceiptId);

      // Auto-close after success
      setTimeout(() => {
        onOpenChange(false);
        setZapComplete(false);
        setComment('');
        setCustomAmount(amount.toString());
      }, 3000);

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
            Send Lightning Zap
          </DialogTitle>
          <DialogDescription>
            {purpose}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Payment Method Info */}
          {!isWebLNAvailable && (
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <Zap className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <strong>QR Code Payment:</strong> A QR code will be displayed for payment with any Lightning wallet.
                For automatic payments, install a browser extension like{' '}
                <a href="https://getalby.com" target="_blank" rel="noopener noreferrer" className="underline">
                  Alby
                </a> or{' '}
                <a href="https://mutinywallet.com" target="_blank" rel="noopener noreferrer" className="underline">
                  Mutiny
                </a>.
              </AlertDescription>
            </Alert>
          )}

          {isWebLNAvailable && !webLNSupported && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <strong>WebLN Available:</strong> Your Lightning wallet extension will handle payments automatically.
                If it doesn't work, a QR code will be shown as backup.
              </AlertDescription>
            </Alert>
          )}

          {/* Recipient Info */}
          <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profileImage} alt={displayName} />
              <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{displayName}</p>
              <p className="text-sm text-muted-foreground">
                {lightningAddress || 'No Lightning address found'}
              </p>
            </div>
          </div>

          {/* Lightning Address Warning */}
          {!lightningAddress && (
            <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                <strong>No Lightning Address:</strong> This user hasn't set up a Lightning address (lud16) in their profile.
                They need to add one to receive zaps.
              </AlertDescription>
            </Alert>
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
              Suggested: {formatSats(amount)} • Minimum: 1 sat
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

          {/* Real Payment Warning */}
          <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
            <Zap className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              <strong>⚡ Real Lightning Payment:</strong> This will send actual Bitcoin.
              Make sure you trust the recipient and the amount is correct.
            </AlertDescription>
          </Alert>

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
              disabled={isZapping || zapComplete || !lightningAddress || !webLNSupported}
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
                  Zap {formatSats(parseInt(customAmount) || amount)}
                </>
              )}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center">
            <p>⚡ This will create a real Lightning payment</p>
            <p>The task status will update when the zap receipt is received</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}