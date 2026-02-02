import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Fetches the pubkeys that a user follows from their kind 3 contact list.
 */
export function useUserFollows(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['user-follows', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [{ kinds: [3], authors: [pubkey], limit: 1 }],
        { signal }
      );

      if (events.length === 0) return [];

      const event = events[0];
      const follows: string[] = [];

      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1]) {
          follows.push(tag[1]);
        }
      }

      return follows;
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
