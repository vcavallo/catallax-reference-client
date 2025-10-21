import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

export const CATALLAX_GLOBAL_OPINION_PUBKEY = '9c86cb094c336c8c16817b17cbcc131addf184aa1323d2f973a8a28072b54287';
export const PRETTY_GOOD_FREEDOM_TECH_PUBKEY = '1b74a50a86757bdfdf35fe7cfe412be485ce0b8fa4c52327f09807cebbb91837';
const BRAINSTORM_RELAY = 'wss://nip85.brainstorm.world';

export interface GrapeRankData {
  rank: number | null;
  verifiedFollowerCount: number | null;
}

export function useGrapeRank(pubkey: string, authorPubkey?: string) {
  const { nostr } = useNostr();

  // Default to Catallax Global Opinion if no author specified
  const author = authorPubkey || CATALLAX_GLOBAL_OPINION_PUBKEY;

  return useQuery({
    queryKey: ['graperank', pubkey, author],
    queryFn: async (c) => {
      if (!pubkey) return { rank: null, verifiedFollowerCount: null };

      try {
        const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

        // Query the brainstorm relay specifically for GrapeRank data
        const events = await nostr.query([{
          kinds: [30382],
          authors: [author],
          '#d': [pubkey],
          limit: 1,
        }], {
          signal,
          relays: [BRAINSTORM_RELAY] // Query specific relay
        });

        if (events.length === 0) {
          return { rank: null, verifiedFollowerCount: null };
        }

        const event = events[0];
        const rankTag = event.tags.find(([name]) => name === 'rank')?.[1];
        const followerCountTag = event.tags.find(([name]) => name === 'verifiedFollowerCount')?.[1];

        return {
          rank: rankTag ? parseInt(rankTag, 10) : null,
          verifiedFollowerCount: followerCountTag ? parseInt(followerCountTag, 10) : null,
        };
      } catch (error) {
        // Silently handle errors - GrapeRank data is supplementary information
        // and shouldn't break the UI if the brainstorm relay is unavailable
        console.debug('GrapeRank data unavailable:', error);
        return { rank: null, verifiedFollowerCount: null };
      }
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000, // 5 minutes - GrapeRank data doesn't change frequently
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}