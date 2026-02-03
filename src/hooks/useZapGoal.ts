import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { calculateGoalProgress, type GoalProgress } from '@/lib/catallax';
import type { NostrEvent } from '@nostrify/nostrify';

interface ZapGoalData {
  goal: NostrEvent;
  receipts: NostrEvent[];
  progress: GoalProgress;
}

// Direct WebSocket query to specific relays - bypasses NPool issues
async function queryRelaysDirect(
  relays: string[],
  filter: { kinds: number[]; '#e'?: string[]; '#a'?: string[]; limit?: number },
  timeoutMs: number = 8000
): Promise<NostrEvent[]> {
  const allEvents: NostrEvent[] = [];
  const seenIds = new Set<string>();

  const promises = relays.map(relayUrl =>
    new Promise<NostrEvent[]>((resolve) => {
      const events: NostrEvent[] = [];
      try {
        const ws = new WebSocket(relayUrl);
        const subId = 'zap-' + Math.random().toString(36).slice(2);

        const timeout = setTimeout(() => {
          ws.close();
          resolve(events);
        }, timeoutMs);

        ws.onopen = () => {
          ws.send(JSON.stringify(['REQ', subId, filter]));
        };

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data[0] === 'EVENT' && data[1] === subId) {
              events.push(data[2] as NostrEvent);
            } else if (data[0] === 'EOSE') {
              clearTimeout(timeout);
              ws.close();
              resolve(events);
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          ws.close();
          resolve(events);
        };
      } catch {
        resolve(events);
      }
    })
  );

  const results = await Promise.all(promises);
  for (const events of results) {
    for (const event of events) {
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id);
        allEvents.push(event);
      }
    }
  }

  return allEvents;
}

export function useZapGoal(goalId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ZapGoalData | null>({
    queryKey: ['zap-goal', goalId],
    queryFn: async (c) => {
      if (!goalId) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);

      // Fetch goal event first
      const goals = await nostr.query([{ ids: [goalId], kinds: [9041] }], { signal });
      const goal = goals[0];
      if (!goal) return null;

      // Extract the goal's linked addressable event (a tag) if any
      const linkedAddress = goal.tags.find(([name]) => name === 'a')?.[1];

      // Get relays from the goal event, fallback to common relays
      const goalRelays = goal.tags.find(([name]) => name === 'relays')?.slice(1) || [];
      const relaysToQuery = goalRelays.length > 0
        ? goalRelays
        : ['wss://relay.primal.net', 'wss://nos.lol', 'wss://relay.damus.io'];

      // Query for zap receipts using direct WebSocket (bypasses NPool issues)
      let receipts = await queryRelaysDirect(
        relaysToQuery,
        { kinds: [9735], '#e': [goalId], limit: 500 }
      );

      // Also query by #a tag if we have a linked address
      if (linkedAddress) {
        const aReceipts = await queryRelaysDirect(
          relaysToQuery,
          { kinds: [9735], '#a': [linkedAddress], limit: 500 }
        );

        // Merge and dedupe
        const seenIds = new Set(receipts.map(r => r.id));
        for (const r of aReceipts) {
          if (!seenIds.has(r.id)) {
            receipts.push(r);
          }
        }
      }

      // Deduplicate receipts by event ID
      const seen = new Set<string>();
      const uniqueReceipts = receipts.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      const progress = calculateGoalProgress(goal, uniqueReceipts);

      return {
        goal,
        receipts: uniqueReceipts,
        progress,
      };
    },
    enabled: !!goalId,
    staleTime: 30000, // 30 seconds - balance freshness vs relay load
    refetchOnWindowFocus: true,
  });
}
