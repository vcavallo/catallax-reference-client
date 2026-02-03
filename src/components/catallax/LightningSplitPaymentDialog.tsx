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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, Wallet, QrCode, Copy, ExternalLink, Users, ChevronRight, SkipForward, XCircle } from 'lucide-react';
import { genUserName } from '@/lib/genUserName';
import { formatSats, type PaymentSplit } from '@/lib/catallax';
import QRCode from 'qrcode';
import type { WebLNProvider } from '@webbtc/webln-types';

type RecipientStatus = 'pending' | 'paid' | 'skipped';

interface LightningSplitPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splits: PaymentSplit[];
  purpose: string;
  onPaymentComplete: (zapReceiptId: string) => void;
  onPaymentError?: (error: string) => void;
}

export function LightningSplitPaymentDialog({
  open,
  onOpenChange,
  splits,
  purpose,
  onPaymentComplete,
  onPaymentError,
}: LightningSplitPaymentDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();

  // Track status of each recipient by pubkey
  const [recipientStatus, setRecipientStatus] = useState<Record<string, RecipientStatus>>({});
  const [invoice, setInvoice] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'webln' | 'qr'>('webln');
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectionInterval, setDetectionInterval] = useState<NodeJS.Timeout | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  // Find the current recipient (first one that's still pending)
  const currentSplit = splits.find(s => (recipientStatus[s.recipientPubkey] || 'pending') === 'pending');
  const currentIndex = currentSplit ? splits.findIndex(s => s.recipientPubkey === currentSplit.recipientPubkey) : -1;

  // Calculate progress
  const totalAmount = splits.reduce((sum, split) => sum + split.amount, 0);
  const paidCount = splits.filter(s => recipientStatus[s.recipientPubkey] === 'paid').length;
  const skippedCount = splits.filter(s => recipientStatus[s.recipientPubkey] === 'skipped').length;
  const completedCount = paidCount + skippedCount;
  const paidAmount = splits
    .filter(s => recipientStatus[s.recipientPubkey] === 'paid')
    .reduce((sum, s) => sum + s.amount, 0);
  const progressPercent = (completedCount / splits.length) * 100;

  const webln = (window as unknown as { webln?: WebLNProvider }).webln;
  const isWebLNAvailable = !!webln;

  // Auto-select QR if WebLN not available
  useEffect(() => {
    if (!isWebLNAvailable) {
      setPaymentMethod('qr');
    }
  }, [isWebLNAvailable]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setRecipientStatus({});
      setInvoice('');
      setQrCodeDataUrl('');
      setIsProcessing(false);
      setInvoiceError(null);
    }
  }, [open]);

  // Cleanup detection interval when dialog closes
  useEffect(() => {
    if (!open && detectionInterval) {
      clearInterval(detectionInterval);
      setDetectionInterval(null);
      setIsProcessing(false);
    }
  }, [open, detectionInterval]);

  const handleClose = () => {
    if (detectionInterval) {
      clearInterval(detectionInterval);
      setDetectionInterval(null);
    }
    onOpenChange(false);
  };

  const generateInvoice = async () => {
    if (!user?.signer || !currentSplit) return;

    setIsProcessing(true);
    setInvoiceError(null);

    try {
      const recipientPubkey = currentSplit.recipientPubkey;
      const amount = currentSplit.amount;

      // Fetch recipient's metadata to get lightning address
      const recipientEvents = await nostr.query([
        { kinds: [0], authors: [recipientPubkey], limit: 1 }
      ], { signal: AbortSignal.timeout(5000) });

      if (recipientEvents.length === 0) {
        throw new Error('Recipient profile not found on relays');
      }

      const recipientMetadata = JSON.parse(recipientEvents[0].content);
      const lightningAddress = getLightningAddressFromMetadata(recipientMetadata);

      if (!lightningAddress) {
        throw new Error('No Lightning address configured');
      }

      // Resolve Lightning address to LNURL-pay endpoint
      let lnurlPayUrl: string;

      if (lightningAddress.includes('@')) {
        const [username, domain] = lightningAddress.split('@');
        lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${username}`;
      } else {
        throw new Error('LNURL format not supported. Need user@domain.com format.');
      }

      // Fetch LNURL-pay info
      const lnurlResponse = await fetch(lnurlPayUrl);
      if (!lnurlResponse.ok) {
        throw new Error(`Lightning service error: ${lnurlResponse.status}`);
      }

      const lnurlData = await lnurlResponse.json();

      if (lnurlData.tag !== 'payRequest') {
        throw new Error('Invalid LNURL-pay response');
      }

      // Check amount limits
      const amountMsat = amount * 1000;
      if (amountMsat < lnurlData.minSendable || amountMsat > lnurlData.maxSendable) {
        throw new Error(`Amount must be between ${lnurlData.minSendable / 1000} and ${lnurlData.maxSendable / 1000} sats`);
      }

      const zapRelays = ['wss://relay.primal.net', 'wss://nos.lol', 'wss://relay.damus.io'];

      // Create zap request event (NIP-57)
      const zapRequestTags: string[][] = [
        ['p', recipientPubkey],
        ['amount', amountMsat.toString()],
        ['relays', ...zapRelays],
      ];

      const zapRequest = await user.signer.signEvent({
        kind: 9734,
        content: currentSplit.purpose || purpose,
        tags: zapRequestTags,
        created_at: Math.floor(Date.now() / 1000),
      });

      // Get Lightning invoice
      const invoiceUrl = new URL(lnurlData.callback);
      invoiceUrl.searchParams.set('amount', amountMsat.toString());
      if (lnurlData.allowsNostr) {
        invoiceUrl.searchParams.set('nostr', JSON.stringify(zapRequest));
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
        width: 250,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeDataUrl(qrDataUrl);

      toast({
        title: 'Invoice Generated',
        description: `Ready to pay ${formatSats(amount)}`,
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate invoice';
      setInvoiceError(message);
      toast({
        title: 'Cannot Pay This Recipient',
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

      await handleSinglePaymentSuccess(paymentResult.preimage);

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

  const handleSinglePaymentSuccess = async (_preimage?: string) => {
    if (!currentSplit) return;

    // Mark this recipient as paid
    const newStatus = {
      ...recipientStatus,
      [currentSplit.recipientPubkey]: 'paid' as RecipientStatus,
    };
    setRecipientStatus(newStatus);

    // Reset invoice state for next recipient
    setInvoice('');
    setQrCodeDataUrl('');
    setInvoiceError(null);

    const newPaidCount = splits.filter(s => newStatus[s.recipientPubkey] === 'paid').length;
    const newSkippedCount = splits.filter(s => newStatus[s.recipientPubkey] === 'skipped').length;
    const newCompletedCount = newPaidCount + newSkippedCount;

    toast({
      title: 'Payment Sent!',
      description: `${newPaidCount} paid, ${newSkippedCount} skipped (${newCompletedCount}/${splits.length})`,
    });

    // Check if all recipients are handled
    if (newCompletedCount >= splits.length) {
      handleAllComplete(newStatus);
    }
  };

  const handleSkipRecipient = () => {
    if (!currentSplit) return;

    // Mark this recipient as skipped
    const newStatus = {
      ...recipientStatus,
      [currentSplit.recipientPubkey]: 'skipped' as RecipientStatus,
    };
    setRecipientStatus(newStatus);

    // Reset invoice state for next recipient
    setInvoice('');
    setQrCodeDataUrl('');
    setInvoiceError(null);

    const newPaidCount = splits.filter(s => newStatus[s.recipientPubkey] === 'paid').length;
    const newSkippedCount = splits.filter(s => newStatus[s.recipientPubkey] === 'skipped').length;
    const newCompletedCount = newPaidCount + newSkippedCount;

    toast({
      title: 'Recipient Skipped',
      description: `${newPaidCount} paid, ${newSkippedCount} skipped (${newCompletedCount}/${splits.length})`,
    });

    // Check if all recipients are handled
    if (newCompletedCount >= splits.length) {
      handleAllComplete(newStatus);
    }
  };

  const handleAllComplete = (finalStatus: Record<string, RecipientStatus>) => {
    const finalPaidCount = splits.filter(s => finalStatus[s.recipientPubkey] === 'paid').length;
    const finalSkippedCount = splits.filter(s => finalStatus[s.recipientPubkey] === 'skipped').length;
    const finalPaidAmount = splits
      .filter(s => finalStatus[s.recipientPubkey] === 'paid')
      .reduce((sum, s) => sum + s.amount, 0);

    toast({
      title: 'All Recipients Handled!',
      description: `Paid ${formatSats(finalPaidAmount)} to ${finalPaidCount} recipients. ${finalSkippedCount} skipped.`,
    });

    onPaymentComplete(`multi_payment_${Date.now()}`);

    // Auto-close after success
    setTimeout(() => {
      handleClose();
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
    if (!invoice || !currentSplit) return;

    setIsProcessing(true);

    try {
      toast({
        title: 'Watching for Payment...',
        description: 'Listening for payment confirmation',
      });

      const startTime = Math.floor(Date.now() / 1000);
      let checkCount = 0;
      const maxChecks = 60;

      const checkInterval = setInterval(async () => {
        checkCount++;

        try {
          const events = await nostr.query([
            {
              kinds: [9735],
              '#p': [currentSplit.recipientPubkey],
              since: startTime,
              limit: 10,
            }
          ], { signal: AbortSignal.timeout(3000) });

          const matchingReceipt = events.find(event => {
            const bolt11Tag = event.tags.find(([name]) => name === 'bolt11');
            return bolt11Tag && bolt11Tag[1] === invoice;
          });

          if (matchingReceipt) {
            clearInterval(checkInterval);
            setDetectionInterval(null);
            setIsProcessing(false);
            handleSinglePaymentSuccess(matchingReceipt.id);
            return;
          }

          const recentReceipt = events
            .filter(event => event.created_at > startTime)
            .sort((a, b) => b.created_at - a.created_at)[0];

          if (recentReceipt && checkCount > 5) {
            clearInterval(checkInterval);
            setDetectionInterval(null);
            setIsProcessing(false);
            handleSinglePaymentSuccess(recentReceipt.id);
            return;
          }

        } catch (error) {
          console.warn('Error checking for zap receipts:', error);
        }

        if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          setDetectionInterval(null);
          setIsProcessing(false);

          toast({
            title: 'Payment Detection Timeout',
            description: 'You can manually confirm if you completed the payment.',
            variant: 'destructive',
          });
        }
      }, 2000);

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

  const allComplete = completedCount >= splits.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Split Payment ({splits.length} recipients)
          </DialogTitle>
          <DialogDescription>
            {purpose}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress Overview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Payment Progress</CardTitle>
              <CardDescription>
                {paidCount} paid, {skippedCount} skipped ({completedCount}/{splits.length}) &bull; {formatSats(paidAmount)} of {formatSats(totalAmount)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={progressPercent} className="h-2" />
            </CardContent>
          </Card>

          {/* Recipients List */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {splits.map((split) => (
                <RecipientRow
                  key={split.recipientPubkey}
                  split={split}
                  status={recipientStatus[split.recipientPubkey] || 'pending'}
                  isCurrent={currentSplit?.recipientPubkey === split.recipientPubkey}
                />
              ))}
            </div>
          </div>

          {/* Current Payment */}
          {!allComplete && currentSplit && (
            <>
              <div className="border-t pt-4">
                <Label className="text-sm text-muted-foreground">
                  Now handling recipient {currentIndex + 1} of {splits.length}
                </Label>
              </div>

              {/* Show error and skip option if invoice generation failed */}
              {invoiceError && (
                <Alert className="border-orange-200 bg-orange-50">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800">
                    <strong>Cannot pay this recipient:</strong> {invoiceError}
                    <br /><br />
                    You can skip this recipient and handle the refund manually (outside of Catallax).
                  </AlertDescription>
                </Alert>
              )}

              {!invoice && !invoiceError ? (
                <div className="space-y-2">
                  <Button
                    onClick={generateInvoice}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? 'Generating Invoice...' : `Generate Invoice for ${formatSats(currentSplit.amount)}`}
                  </Button>
                  <Button
                    onClick={handleSkipRecipient}
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                  >
                    <SkipForward className="h-4 w-4 mr-2" />
                    Skip (already paid outside Catallax)
                  </Button>
                </div>
              ) : !invoice && invoiceError ? (
                <div className="space-y-2">
                  <Button
                    onClick={generateInvoice}
                    disabled={isProcessing}
                    variant="outline"
                    className="w-full"
                  >
                    Retry Invoice Generation
                  </Button>
                  <Button
                    onClick={handleSkipRecipient}
                    variant="destructive"
                    className="w-full"
                  >
                    <SkipForward className="h-4 w-4 mr-2" />
                    Skip This Recipient
                  </Button>
                </div>
              ) : (
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

                  <TabsContent value="webln" className="space-y-3">
                    {!isWebLNAvailable ? (
                      <Alert className="border-orange-200 bg-orange-50">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        <AlertDescription>
                          WebLN not available. Use QR code instead.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Button
                        onClick={payWithWebLN}
                        disabled={isProcessing}
                        className="w-full"
                      >
                        {isProcessing ? 'Processing...' : `Pay ${formatSats(currentSplit.amount)}`}
                      </Button>
                    )}
                  </TabsContent>

                  <TabsContent value="qr" className="space-y-3">
                    {qrCodeDataUrl && (
                      <div className="flex justify-center">
                        <img src={qrCodeDataUrl} alt="Lightning Invoice QR Code" className="rounded-lg" />
                      </div>
                    )}

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

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={openInWallet} className="flex-1">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in Wallet
                      </Button>
                      <Button
                        onClick={startPaymentDetection}
                        disabled={isProcessing}
                        className="flex-1"
                      >
                        {isProcessing ? 'Watching...' : 'I Paid - Detect'}
                      </Button>
                    </div>

                    {isProcessing && (
                      <Button
                        variant="outline"
                        onClick={() => handleSinglePaymentSuccess()}
                        className="w-full"
                      >
                        Confirm Manually
                      </Button>
                    )}
                  </TabsContent>

                  {/* Skip option even when invoice is ready */}
                  <div className="pt-2 border-t mt-4">
                    <Button
                      onClick={handleSkipRecipient}
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground"
                    >
                      <SkipForward className="h-4 w-4 mr-2" />
                      Skip (already paid outside Catallax)
                    </Button>
                  </div>
                </Tabs>
              )}
            </>
          )}

          {/* All Complete */}
          {allComplete && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                All recipients handled! {paidCount} paid, {skippedCount} skipped.
              </AlertDescription>
            </Alert>
          )}

          {/* Cancel Button */}
          {!allComplete && (
            <Button
              variant="outline"
              onClick={handleClose}
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

function RecipientRow({
  split,
  status,
  isCurrent,
}: {
  split: PaymentSplit;
  status: RecipientStatus;
  isCurrent: boolean;
}) {
  const author = useAuthor(split.recipientPubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(split.recipientPubkey);

  return (
    <div className={`flex items-center gap-2 p-2 rounded-md text-sm ${
      isCurrent ? 'bg-primary/10 border border-primary/20' :
      status === 'paid' ? 'bg-green-50 dark:bg-green-950' :
      status === 'skipped' ? 'bg-orange-50 dark:bg-orange-950' : 'bg-muted/50'
    }`}>
      <Avatar className="h-6 w-6">
        <AvatarImage src={metadata?.picture} />
        <AvatarFallback className="text-xs">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="flex-1 truncate">{displayName}</span>
      <span className="font-mono text-xs">{formatSats(split.amount)}</span>
      {status === 'paid' && <CheckCircle className="h-4 w-4 text-green-600" />}
      {status === 'skipped' && <XCircle className="h-4 w-4 text-orange-500" />}
      {isCurrent && status === 'pending' && <ChevronRight className="h-4 w-4 text-primary" />}
    </div>
  );
}
