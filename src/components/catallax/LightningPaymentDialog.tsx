import { useState, useEffect } from 'react';
import { getLightningAddressFromMetadata } from '@/hooks/useRealZap';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostr } from '@nostrify/react';
import { useToast } from '@/hooks/useToast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, AlertTriangle, CheckCircle, Wallet, QrCode, Copy, ExternalLink } from 'lucide-react';
import { genUserName } from '@/lib/genUserName';
import { formatSats } from '@/lib/catallax';
import QRCode from 'qrcode';
import type { WebLNProvider } from '@webbtc/webln-types';

interface LightningPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientPubkey: string;
  amount: number; // in sats
  purpose: string;
  onPaymentComplete: (zapReceiptId: string) => void;
  onPaymentError?: (error: string) => void;
  /** Addressable event reference (a tag) for the task being funded, e.g. "33401:pubkey:d-tag" */
  eventReference?: string;
}

export function LightningPaymentDialog({
  open,
  onOpenChange,
  recipientPubkey,
  amount,
  purpose,
  onPaymentComplete,
  onPaymentError,
  eventReference,
}: LightningPaymentDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const author = useAuthor(recipientPubkey);
  const metadata = author.data?.metadata;

  const [comment, setComment] = useState('');
  const [customAmount, setCustomAmount] = useState(amount.toString());
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [invoice, setInvoice] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'webln' | 'qr'>('webln');
  const [_zapRequestEvent, setZapRequestEvent] = useState<unknown>(null);
  const [detectionInterval, setDetectionInterval] = useState<NodeJS.Timeout | null>(null);

  const displayName = metadata?.name ?? genUserName(recipientPubkey);
  const profileImage = metadata?.picture;
  const lightningAddress = getLightningAddressFromMetadata(metadata);

  const webln = (window as unknown as { webln?: WebLNProvider }).webln;
  const isWebLNAvailable = !!webln;

  // Auto-select QR if WebLN not available
  useEffect(() => {
    if (!isWebLNAvailable) {
      setPaymentMethod('qr');
    }
  }, [isWebLNAvailable]);

  // Cleanup detection interval when dialog closes
  useEffect(() => {
    if (!open && detectionInterval) {
      clearInterval(detectionInterval);
      setDetectionInterval(null);
      setIsProcessing(false);
    }
  }, [open, detectionInterval]);

  const generateInvoice = async () => {
    if (!user?.signer || !lightningAddress) return;

    setIsProcessing(true);

    try {
      const zapAmount = parseInt(customAmount);
      if (isNaN(zapAmount) || zapAmount <= 0) {
        throw new Error('Invalid amount');
      }

      // Fetch recipient's metadata
      const recipientEvents = await nostr.query([
        { kinds: [0], authors: [recipientPubkey], limit: 1 }
      ], { signal: AbortSignal.timeout(5000) });

      if (recipientEvents.length === 0) {
        throw new Error('Recipient profile not found');
      }

      // Resolve Lightning address to LNURL-pay endpoint
      let lnurlPayUrl: string;

      if (lightningAddress.includes('@')) {
        const [username, domain] = lightningAddress.split('@');
        lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${username}`;
      } else {
        throw new Error('LNURL format not yet supported. Please use Lightning address format (user@domain.com)');
      }

      // Fetch LNURL-pay info
      const lnurlResponse = await fetch(lnurlPayUrl);
      if (!lnurlResponse.ok) {
        throw new Error(`Failed to fetch LNURL-pay info: ${lnurlResponse.status}`);
      }

      const lnurlData = await lnurlResponse.json();

      if (lnurlData.tag !== 'payRequest') {
        throw new Error('Invalid LNURL-pay response');
      }

      // Check amount limits
      const amountMsat = zapAmount * 1000;
      if (amountMsat < lnurlData.minSendable || amountMsat > lnurlData.maxSendable) {
        throw new Error(`Amount must be between ${lnurlData.minSendable / 1000} and ${lnurlData.maxSendable / 1000} sats`);
      }

      // Create zap request event (NIP-57)
      const zapRequestTags: string[][] = [
        ['p', recipientPubkey],
        ['amount', amountMsat.toString()],
        ['relays', 'wss://relay.nostr.band', 'wss://nos.lol'],
      ];

      // Add event reference if provided (links zap to a specific task/event)
      if (eventReference) {
        zapRequestTags.push(['a', eventReference]);
      }

      const zapRequest = await user.signer.signEvent({
        kind: 9734,
        content: comment || purpose,
        tags: zapRequestTags,
        created_at: Math.floor(Date.now() / 1000),
      });

      setZapRequestEvent(zapRequest);

      // Get Lightning invoice
      const invoiceUrl = new URL(lnurlData.callback);
      invoiceUrl.searchParams.set('amount', amountMsat.toString());
      if (lnurlData.allowsNostr) {
        invoiceUrl.searchParams.set('nostr', JSON.stringify(zapRequest));
      }
      if (comment) {
        invoiceUrl.searchParams.set('comment', comment);
      }

      const invoiceResponse = await fetch(invoiceUrl.toString());
      if (!invoiceResponse.ok) {
        throw new Error(`Failed to get invoice: ${invoiceResponse.status}`);
      }

      const invoiceData = await invoiceResponse.json();

      if (invoiceData.status === 'ERROR') {
        throw new Error(invoiceData.reason || 'Failed to get Lightning invoice');
      }

      if (!invoiceData.pr) {
        throw new Error('No payment request in invoice response');
      }

      setInvoice(invoiceData.pr);

      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(invoiceData.pr, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeDataUrl(qrDataUrl);

      toast({
        title: 'Invoice Generated',
        description: 'Lightning invoice ready for payment',
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate invoice';
      toast({
        title: 'Invoice Generation Failed',
        description: message,
        variant: 'destructive',
      });
      onPaymentError?.(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const payWithWebLN = async () => {
    if (!webln || !invoice) return;

    setIsProcessing(true);

    try {
      await webln.enable();
      const paymentResult = await webln.sendPayment(invoice);

      if (!paymentResult.preimage) {
        throw new Error('Payment completed but no preimage received');
      }

      await handlePaymentSuccess(paymentResult.preimage);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebLN payment failed';
      toast({
        title: 'Payment Failed',
        description: message,
        variant: 'destructive',
      });
      onPaymentError?.(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = async (preimage?: string) => {
    setPaymentComplete(true);

    toast({
      title: 'Payment Sent!',
      description: `Successfully paid ${customAmount} sats. Updating task status...`,
    });

    // Wait a moment for potential zap receipt, then use preimage as backup
    let zapReceiptId: string;

    try {
      // Try to find the actual zap receipt event for a few seconds
      const zapReceiptPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for zap receipt'));
        }, 10000); // Wait up to 10 seconds

        // Subscribe to zap receipts
        nostr.query([
          {
            kinds: [9735], // Zap receipt events
            '#p': [recipientPubkey],
            since: Math.floor(Date.now() / 1000) - 60, // Look for receipts from last minute
            limit: 10,
          }
        ], { signal: AbortSignal.timeout(10000) }).then(events => {
          // Find the most recent zap receipt that matches our payment
          const zapReceipt = events
            .sort((a, b) => b.created_at - a.created_at)
            .find(event => {
              const bolt11Tag = event.tags.find(([name]) => name === 'bolt11');
              return bolt11Tag && bolt11Tag[1] === invoice;
            });

          if (zapReceipt) {
            clearTimeout(timeout);
            resolve(zapReceipt.id);
          } else {
            // If no exact match, use the most recent zap receipt to this recipient
            const recentReceipt = events[0];
            if (recentReceipt) {
              clearTimeout(timeout);
              resolve(recentReceipt.id);
            } else {
              clearTimeout(timeout);
              reject(new Error('No zap receipt found'));
            }
          }
        }).catch(reject);
      });

      zapReceiptId = await zapReceiptPromise;

      toast({
        title: 'Zap Receipt Found!',
        description: 'Task status will be updated with payment proof',
      });

    } catch {
      // Fallback to preimage-based ID if no zap receipt found
      zapReceiptId = preimage ? `payment_${preimage.slice(0, 16)}` : `manual_payment_${Date.now()}`;

      toast({
        title: 'Payment Confirmed',
        description: 'Using payment preimage as proof',
      });
    }

    // Trigger the task status update
    onPaymentComplete(zapReceiptId);

    // Auto-close after success
    setTimeout(() => {
      onOpenChange(false);
      setPaymentComplete(false);
      setComment('');
      setCustomAmount(amount.toString());
      setInvoice('');
      setQrCodeDataUrl('');
    }, 2000);
  };

  const copyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    toast({
      title: 'Copied!',
      description: 'Lightning invoice copied to clipboard',
    });
  };

  const openInWallet = () => {
    window.open(`lightning:${invoice}`, '_blank');
  };

  const startPaymentDetection = async () => {
    if (!invoice) return;

    setIsProcessing(true);

    try {
      toast({
        title: 'Watching for Payment...',
        description: 'Listening for zap receipt on Nostr relays',
      });

      const startTime = Math.floor(Date.now() / 1000);
      let checkCount = 0;
      const maxChecks = 60; // Check for 2 minutes (every 2 seconds)

      // Create an interval to check for new zap receipts
      const checkInterval = setInterval(async () => {
        checkCount++;

        try {
          // Query for recent zap receipts
          const events = await nostr.query([
            {
              kinds: [9735], // Zap receipt events
              '#p': [recipientPubkey],
              since: startTime, // Only events since we started watching
              limit: 10,
            }
          ], { signal: AbortSignal.timeout(3000) });

          // Check if any zap receipt matches our invoice
          const matchingReceipt = events.find(event => {
            const bolt11Tag = event.tags.find(([name]) => name === 'bolt11');
            return bolt11Tag && bolt11Tag[1] === invoice;
          });

          if (matchingReceipt) {
            clearInterval(checkInterval);
            setIsProcessing(false);

            toast({
              title: 'Payment Confirmed!',
              description: 'Zap receipt received - updating task status',
            });

            handlePaymentSuccess(matchingReceipt.id);
            return;
          }

          // Also check for very recent zap receipts (fallback for services that don't include bolt11)
          const recentReceipt = events
            .filter(event => event.created_at > startTime)
            .sort((a, b) => b.created_at - a.created_at)[0];

          if (recentReceipt && checkCount > 5) { // After 10 seconds, accept recent receipts
            clearInterval(checkInterval);
            setIsProcessing(false);

            toast({
              title: 'Payment Detected!',
              description: 'Recent zap receipt found - updating task status',
            });

            handlePaymentSuccess(recentReceipt.id);
            return;
          }

          // Progress updates
          if (checkCount % 15 === 0) { // Every 30 seconds
            toast({
              title: 'Still Watching...',
              description: `Checking for payment confirmation (${checkCount * 2}s)`,
            });
          }

        } catch (error) {
          console.warn('Error checking for zap receipts:', error);
        }

        // Timeout after 2 minutes
        if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          setIsProcessing(false);

          toast({
            title: 'Payment Detection Timeout',
            description: 'No zap receipt received. Payment may still be processing or you can manually confirm.',
            variant: 'destructive',
          });
        }
      }, 2000); // Check every 2 seconds

      setDetectionInterval(checkInterval);

    } catch (error) {
      setIsProcessing(false);
      const message = error instanceof Error ? error.message : 'Payment detection failed';
      toast({
        title: 'Detection Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Lightning Payment to Arbiter
          </DialogTitle>
          <DialogDescription>
            {purpose}
          </DialogDescription>
        </DialogHeader>

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
                {lightningAddress || 'No Lightning address found'}
              </p>
            </div>
          </div>

          {/* Lightning Address Warning */}
          {!lightningAddress && (
            <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                This user hasn't set up a Lightning address in their profile.
              </AlertDescription>
            </Alert>
          )}

          {lightningAddress && !invoice && (
            <>
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

              {/* Generate Invoice Button */}
              <Button
                onClick={generateInvoice}
                disabled={isProcessing || !lightningAddress}
                className="w-full"
              >
                {isProcessing ? 'Generating Invoice...' : 'Generate Lightning Invoice'}
              </Button>
            </>
          )}

          {/* Payment Methods */}
          {invoice && !paymentComplete && (
            <Tabs value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'webln' | 'qr')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="webln" disabled={!isWebLNAvailable}>
                  <Wallet className="h-4 w-4 mr-2" />
                  WebLN
                </TabsTrigger>
                <TabsTrigger value="qr">
                  <QrCode className="h-4 w-4 mr-2" />
                  QR Code
                </TabsTrigger>
              </TabsList>

              <TabsContent value="webln" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Pay with WebLN</CardTitle>
                    <CardDescription>
                      Use your browser Lightning wallet extension
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!isWebLNAvailable ? (
                      <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        <AlertDescription>
                          WebLN wallet extension not found. Install Alby, Mutiny, or similar.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Button
                        onClick={payWithWebLN}
                        disabled={isProcessing}
                        className="w-full"
                      >
                        {isProcessing ? 'Processing Payment...' : `Pay ${formatSats(parseInt(customAmount))}`}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="qr" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Scan QR Code</CardTitle>
                    <CardDescription>
                      Use any Lightning wallet to scan and pay
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {qrCodeDataUrl && (
                      <div className="flex justify-center">
                        <img src={qrCodeDataUrl} alt="Lightning Invoice QR Code" className="rounded-lg" />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Lightning Invoice</Label>
                      <div className="flex gap-2">
                        <Input
                          value={invoice}
                          readOnly
                          className="font-mono text-xs"
                        />
                        <Button variant="outline" size="sm" onClick={copyInvoice}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={openInWallet} className="flex-1">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in Wallet
                        </Button>
                        <Button
                          onClick={() => startPaymentDetection()}
                          disabled={isProcessing}
                          className="flex-1"
                        >
                          {isProcessing ? 'Watching for Payment...' : 'Pay & Auto-Detect'}
                        </Button>
                      </div>

                      {isProcessing && (
                        <Button
                          variant="outline"
                          onClick={() => handlePaymentSuccess()}
                          className="w-full"
                        >
                          I Paid - Confirm Manually
                        </Button>
                      )}
                    </div>

                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Click "Pay & Auto-Detect" to automatically watch for payment confirmation on Nostr relays.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* Success State */}
          {paymentComplete && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Payment completed! The task will be updated automatically.
              </AlertDescription>
            </Alert>
          )}

          {/* Cancel Button */}
          {!paymentComplete && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
              className="w-full"
            >
              Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}