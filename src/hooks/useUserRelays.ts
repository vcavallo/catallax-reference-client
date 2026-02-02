import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Fetches a user's relay list from their NIP-65 kind 10002 event.
 * Returns relay URLs that the user writes to (no marker or "write" marker).
 */
export function useUserRelays(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['user-relays', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [{ kinds: [10002], authors: [pubkey], limit: 1 }],
        { signal }
      );

      if (events.length === 0) return [];

      const event = events[0];
      const relays: string[] = [];

      for (const tag of event.tags) {
        if (tag[0] !== 'r') continue;
        const url = tag[1];
        const marker = tag[2];

        // Include relays with no marker (read+write) or "write" marker
        if (!marker || marker === 'write') {
          relays.push(url);
        }
      }

      return relays;
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
