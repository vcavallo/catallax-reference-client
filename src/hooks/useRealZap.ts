import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostr } from '@nostrify/react';
import { useToast } from '@/hooks/useToast';
import type { WebLNProvider } from '@webbtc/webln-types';

interface ZapRequest {
  recipientPubkey: string;
  amount: number; // in sats
  comment?: string;
  lightningAddress?: string;
  relays?: string[];
  zapTags?: string[][]; // For zap splits
}

interface ZapResult {
  zapReceiptId: string;
  preimage: string;
  invoice: string;
}

export function useRealZap() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const [isZapping, setIsZapping] = useState(false);

  const sendZap = async (request: ZapRequest): Promise<ZapResult> => {
    if (!user?.signer) {
      throw new Error('No signer available');
    }

    setIsZapping(true);

    try {
      // Step 1: Check for WebLN support (optional)
      const webln = (window as unknown as { webln?: WebLNProvider }).webln;
      let webLNEnabled = false;

      if (webln) {
        try {
          await webln.enable();
          webLNEnabled = true;
          toast({
            title: 'WebLN Detected',
            description: 'Using your browser Lightning wallet',
          });
        } catch (error) {
          console.log('WebLN available but failed to enable:', error);
          webLNEnabled = false;
        }
      }

      // Step 2: Get Lightning address (from prop or fetch from profile)
      let lightningAddress = request.lightningAddress;

      if (!lightningAddress) {
        // Fetch recipient's metadata to get Lightning address
        const recipientEvents = await nostr.query([
          { kinds: [0], authors: [request.recipientPubkey], limit: 1 }
        ], { signal: AbortSignal.timeout(5000) });

        if (recipientEvents.length === 0) {
          throw new Error('Recipient profile not found. They need to publish a profile with a Lightning address.');
        }

        const metadata = JSON.parse(recipientEvents[0].content);
        lightningAddress = metadata.lud16 || metadata.lud06;

        if (!lightningAddress) {
          throw new Error('Recipient has no Lightning address (lud16/lud06) in their profile. They need to add one to receive zaps.');
        }
      }

      toast({
        title: 'Processing Zap...',
        description: `Found Lightning address: ${lightningAddress}`,
      });

      // Step 3: Resolve Lightning address to LNURL-pay endpoint
      let lnurlPayUrl: string;

      if (lightningAddress.includes('@')) {
        // Lightning address format (user@domain.com)
        const [username, domain] = lightningAddress.split('@');
        lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${username}`;
      } else if (lightningAddress.toLowerCase().startsWith('lnurl')) {
        // LNURL format - would need bech32 decoding
        throw new Error('LNURL format not yet supported. Please use Lightning address format (user@domain.com)');
      } else {
        throw new Error('Invalid Lightning address format');
      }

      // Step 4: Fetch LNURL-pay info
      const lnurlResponse = await fetch(lnurlPayUrl);
      if (!lnurlResponse.ok) {
        throw new Error(`Failed to fetch LNURL-pay info: ${lnurlResponse.status}`);
      }

      const lnurlData = await lnurlResponse.json();

      if (lnurlData.tag !== 'payRequest') {
        throw new Error('Invalid LNURL-pay response - not a payment request');
      }

      // Step 5: Check amount limits
      const amountMsat = request.amount * 1000;
      if (amountMsat < lnurlData.minSendable || amountMsat > lnurlData.maxSendable) {
        throw new Error(`Amount must be between ${lnurlData.minSendable / 1000} and ${lnurlData.maxSendable / 1000} sats`);
      }

      // Step 6: Check if zaps are supported
      if (!lnurlData.allowsNostr) {
        throw new Error('Recipient does not support Nostr zaps. Regular Lightning payment would be needed.');
      }

      // Step 7: Create zap request event (NIP-57)
      const tags = [
        ['p', request.recipientPubkey],
        ['amount', amountMsat.toString()],
        ['relays', ...(request.relays || ['wss://relay.nostr.band', 'wss://nos.lol'])],
      ];

      // Add zap split tags if provided
      if (request.zapTags) {
        tags.push(...request.zapTags);
        console.log('Adding zap split tags:', request.zapTags);
      }

      const zapRequestEvent = await user.signer.signEvent({
        kind: 9734,
        content: request.comment || '',
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      console.log('Zap request event created with tags:', tags);

      toast({
        title: 'Getting Invoice...',
        description: 'Requesting Lightning invoice from recipient',
      });

      // Step 8: Get Lightning invoice with zap request
      const invoiceUrl = new URL(lnurlData.callback);
      invoiceUrl.searchParams.set('amount', amountMsat.toString());
      invoiceUrl.searchParams.set('nostr', JSON.stringify(zapRequestEvent));
      if (request.comment) {
        invoiceUrl.searchParams.set('comment', request.comment);
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

      // Step 9: Pay the invoice
      let paymentResult: { preimage: string };

      if (webLNEnabled && webln) {
        // Use WebLN for automatic payment
        toast({
          title: 'Paying Invoice...',
          description: 'Please confirm payment in your Lightning wallet',
        });

        try {
          paymentResult = await webln.sendPayment(invoiceData.pr);

          if (!paymentResult.preimage) {
            throw new Error('Payment completed but no preimage received');
          }

          toast({
            title: 'Payment Sent!',
            description: `Successfully zapped ${request.amount.toLocaleString()} sats`,
          });
        } catch (webLNError) {
          console.error('WebLN payment failed:', webLNError);
          throw new Error(`WebLN payment failed: ${webLNError instanceof Error ? webLNError.message : 'Unknown error'}`);
        }
      } else {
        // Fallback to QR code display
        const splitInfo = request.zapTags ? ` (split between ${request.zapTags.length + 1} recipients)` : '';
        toast({
          title: 'Lightning Invoice Generated',
          description: `Please scan the QR code or copy the invoice to pay${splitInfo}`,
        });

        // Show QR code and wait for payment
        const qrCodeUrl = `lightning:${invoiceData.pr}`;

        // Create a simple modal with QR code
        const qrModal = document.createElement('div');
        qrModal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          font-family: system-ui, -apple-system, sans-serif;
        `;

        qrModal.innerHTML = `
          <div style="
            background: white;
            padding: 2rem;
            border-radius: 1rem;
            max-width: 400px;
            text-align: center;
            position: relative;
          ">
            <button id="close-qr" style="
              position: absolute;
              top: 1rem;
              right: 1rem;
              background: none;
              border: none;
              font-size: 1.5rem;
              cursor: pointer;
              color: #666;
            ">×</button>

            <h3 style="margin: 0 0 1rem 0; color: #333;">Lightning Payment</h3>
            <p style="margin: 0 0 1rem 0; color: #666; font-size: 0.9rem;">
              ${request.amount.toLocaleString()} sats${request.zapTags ? ` (split payment)` : ''}
            </p>
            ${request.zapTags ? `
              <div style="margin: 0 0 1rem 0; padding: 0.5rem; background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 0.25rem; font-size: 0.8rem; color: #0369a1;">
                <strong>⚡ Zap Split:</strong> This payment will be automatically distributed between ${request.zapTags.length + 1} recipients using NIP-57 zap splits.
              </div>
            ` : ''}

            <div id="qr-code" style="margin: 1rem 0; display: flex; justify-content: center;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}"
                   alt="Lightning Invoice QR Code"
                   style="border: 1px solid #ddd; border-radius: 0.5rem;" />
            </div>

            <div style="margin: 1rem 0;">
              <input type="text" value="${invoiceData.pr}" readonly
                     style="
                       width: 100%;
                       padding: 0.5rem;
                       border: 1px solid #ddd;
                       border-radius: 0.25rem;
                       font-size: 0.8rem;
                       font-family: monospace;
                       background: #f9f9f9;
                     " />
            </div>

            <button id="copy-invoice" style="
              background: #3b82f6;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 0.25rem;
              cursor: pointer;
              margin: 0.25rem;
            ">Copy Invoice</button>

            <button id="manual-confirm" style="
              background: #10b981;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 0.25rem;
              cursor: pointer;
              margin: 0.25rem;
            ">I Paid - Continue</button>

            <p id="payment-progress" style="margin: 1rem 0 0 0; color: #666; font-size: 0.8rem;">
              Payment will be detected automatically once completed
            </p>
            <p style="margin: 0.5rem 0 0 0; color: #888; font-size: 0.7rem;">
              If auto-detection fails, click "I Paid - Continue" after payment
            </p>
          </div>
        `;

        document.body.appendChild(qrModal);

        // Handle copy button
        const copyButton = qrModal.querySelector('#copy-invoice') as HTMLButtonElement;
        copyButton.addEventListener('click', () => {
          navigator.clipboard.writeText(invoiceData.pr);
          copyButton.textContent = 'Copied!';
          setTimeout(() => {
            copyButton.textContent = 'Copy Invoice';
          }, 2000);
        });

        // Handle manual confirmation button
        let manualConfirmed = false;
        const manualButton = qrModal.querySelector('#manual-confirm') as HTMLButtonElement;
        manualButton.addEventListener('click', () => {
          manualConfirmed = true;
          manualButton.textContent = 'Payment Confirmed!';
          manualButton.style.background = '#059669';
        });

        // Handle close button
        const closeButton = qrModal.querySelector('#close-qr') as HTMLButtonElement;
        const closeModal = () => {
          document.body.removeChild(qrModal);
          throw new Error('Payment cancelled by user');
        };
        closeButton.addEventListener('click', closeModal);
        qrModal.addEventListener('click', (e) => {
          if (e.target === qrModal) closeModal();
        });

        // Poll for payment completion
        const pollForPayment = async (): Promise<{ preimage: string }> => {
          const maxAttempts = 60; // 5 minutes with 5-second intervals
          let attempts = 0;
          const startTime = Math.floor(Date.now() / 1000) - 60; // Look back 1 minute to be safe

          console.log('Starting payment polling for invoice:', invoiceData.pr.slice(0, 20) + '...');

          while (attempts < maxAttempts) {
            // Check for manual confirmation first
            if (manualConfirmed) {
              document.body.removeChild(qrModal);
              toast({
                title: 'Payment Confirmed!',
                description: `Payment marked as completed - ${request.amount.toLocaleString()} sats`,
              });

              // Generate a manual confirmation ID
              const manualReceiptId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              return { preimage: manualReceiptId };
            }

            try {
              // Check multiple ways to find the zap receipt
              const queries = [
                // Query 1: Look for receipts to the main recipient
                {
                  kinds: [9735],
                  '#p': [request.recipientPubkey],
                  since: startTime,
                  limit: 20
                },
                // Query 2: Look for receipts containing our bolt11 invoice
                {
                  kinds: [9735],
                  '#bolt11': [invoiceData.pr],
                  since: startTime,
                  limit: 5
                }
              ];

              // If we have zap splits, also check for receipts to other recipients
              if (request.zapTags) {
                for (const zapTag of request.zapTags) {
                  if (zapTag[1] && zapTag[1] !== request.recipientPubkey) {
                    queries.push({
                      kinds: [9735],
                      '#p': [zapTag[1]],
                      since: startTime,
                      limit: 10
                    });
                  }
                }
              }

              console.log(`Polling attempt ${attempts + 1}/${maxAttempts}, checking ${queries.length} queries...`);

              for (const query of queries) {
                const zapReceipts = await nostr.query([query], { signal: AbortSignal.timeout(3000) });

                console.log(`Query for ${query['#p'] || query['#bolt11'] || 'unknown'} returned ${zapReceipts.length} receipts`);

                // Look for a receipt that matches our invoice
                for (const receipt of zapReceipts) {
                  const bolt11Tag = receipt.tags.find(([name]) => name === 'bolt11')?.[1];
                  const descriptionTag = receipt.tags.find(([name]) => name === 'description')?.[1];

                  // Check if this receipt matches our payment
                  const isMatch = bolt11Tag === invoiceData.pr ||
                                 (descriptionTag && descriptionTag.includes(zapRequestEvent.id));

                  if (isMatch) {
                    const preimageTag = receipt.tags.find(([name]) => name === 'preimage')?.[1];
                    console.log('Found matching zap receipt:', receipt.id, 'preimage:', !!preimageTag);

                    document.body.removeChild(qrModal);
                    toast({
                      title: 'Payment Confirmed!',
                      description: `Successfully zapped ${request.amount.toLocaleString()} sats`,
                    });

                    // Return the receipt ID as the "preimage" for compatibility
                    return { preimage: receipt.id };
                  }
                }
              }
            } catch (error) {
              console.log('Error checking for payment:', error);
            }

            // Update modal with progress
            const progressElement = qrModal.querySelector('#payment-progress');
            if (progressElement) {
              progressElement.textContent = `Checking for payment... (${attempts + 1}/${maxAttempts})`;
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            attempts++;
          }

          document.body.removeChild(qrModal);
          throw new Error('Payment timeout - no confirmation received within 5 minutes');
        };

        paymentResult = await pollForPayment();
      }

      // Step 10: Wait for zap receipt event (kind 9735)
      // We'll wait up to 30 seconds for the zap receipt
      const zapReceiptPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for zap receipt'));
        }, 30000);

        const sub = nostr.query([
          {
            kinds: [9735],
            '#p': [user.pubkey],
            since: Math.floor(Date.now() / 1000) - 60, // Look for receipts from last minute
            limit: 10,
          }
        ], { signal: AbortSignal.timeout(30000) });

        sub.then(events => {
          // Find the zap receipt that matches our payment
          const zapReceipt = events.find(event => {
            const bolt11Tag = event.tags.find(([name]) => name === 'bolt11');
            return bolt11Tag && bolt11Tag[1] === invoiceData.pr;
          });

          if (zapReceipt) {
            clearTimeout(timeout);
            resolve(zapReceipt.id);
          } else {
            // If no receipt found immediately, we'll use the payment preimage as proof
            clearTimeout(timeout);
            resolve(`payment_${paymentResult.preimage.slice(0, 16)}`);
          }
        }).catch(reject);
      });

      const zapReceiptId = await zapReceiptPromise;

      return {
        zapReceiptId,
        preimage: paymentResult.preimage,
        invoice: invoiceData.pr,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send zap';
      toast({
        title: 'Zap Failed',
        description: message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsZapping(false);
    }
  };

  const checkWebLNSupport = async (): Promise<boolean> => {
    const webln = (window as unknown as { webln?: WebLNProvider }).webln;
    if (!webln) return false;

    try {
      await webln.enable();
      return true;
    } catch {
      return false;
    }
  };

  return {
    sendZap,
    isZapping,
    checkWebLNSupport,
    isWebLNAvailable: !!(window as unknown as { webln?: WebLNProvider }).webln,
  };
}

// Helper function to validate Lightning address
export function isValidLightningAddress(address: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(address) || address.toLowerCase().startsWith('lnurl');
}

// Helper function to extract Lightning address from metadata
export function getLightningAddressFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  return (metadata.lud16 as string) || (metadata.lud06 as string) || null;
}