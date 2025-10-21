import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

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
  preimage?: string;
}

export function useZap() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [isZapping, setIsZapping] = useState(false);

  const sendZap = async (request: ZapRequest): Promise<ZapResult> => {
    if (!user?.signer) {
      throw new Error('No signer available');
    }

    setIsZapping(true);

    try {
      // Check if the signer supports NIP-07 zap method
      if (!user.signer.nip04) {
        throw new Error('Signer does not support required encryption methods');
      }

      // ⚠️ DEMO MODE: This is a simulated zap for testing purposes
      // Real implementation would:
      // 1. Check for WebLN support: if (window.webln) await window.webln.enable()
      // 2. Fetch LNURL from recipient's metadata or NIP-05
      // 3. Get Lightning invoice from LNURL-pay endpoint
      // 4. Present invoice to user via WebLN or QR code
      // 5. Wait for payment confirmation
      // 6. Create and publish zap request event
      // 7. Wait for zap receipt event from relays

      const splitInfo = request.zapTags ? ` (split between ${request.zapTags.length} recipients)` : '';
      toast({
        title: '⚠️ DEMO MODE - Simulated Zap',
        description: `This is a fake zap for ${request.amount.toLocaleString()} sats${splitInfo}. No real Lightning payment was made.`,
        variant: 'destructive',
      });

      // Simulate payment delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate a mock zap receipt ID
      const mockZapReceiptId = `demo_zap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      toast({
        title: '✅ Demo Zap "Completed"',
        description: `Simulated zap of ${request.amount.toLocaleString()} sats completed for testing`,
      });

      return {
        zapReceiptId: mockZapReceiptId,
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

  return {
    sendZap,
    isZapping,
  };
}

// Helper function to validate Lightning address or LNURL
export function isValidLightningAddress(address: string): boolean {
  // Check for Lightning address format (email-like)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(address)) {
    return true;
  }

  // Check for LNURL format
  if (address.toLowerCase().startsWith('lnurl')) {
    return true;
  }

  return false;
}

// Helper function to extract Lightning address from NIP-05 identifier
export function getLightningAddressFromNip05(nip05: string): string | null {
  if (!nip05) return null;

  // For simplicity, assume the Lightning address is the same as NIP-05
  // In practice, you'd need to fetch the .well-known/nostr.json file
  // and check for the "lud16" field
  return nip05;
}