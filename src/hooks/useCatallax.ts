import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import {
  CATALLAX_KINDS,
  parseArbiterAnnouncement,
  parseTaskProposal,
  parseTaskConclusion,
  type ArbiterAnnouncement,
  type TaskProposal,
  type TaskConclusion,
  type TaskStatus
} from '@/lib/catallax';

// Utility hook for invalidating all Catallax-related queries
export function useCatallaxInvalidation() {
  const queryClient = useQueryClient();

  const invalidateAllCatallaxQueries = () => {
    // Invalidate all catallax queries
    queryClient.invalidateQueries({ queryKey: ['catallax'] });

    // Also invalidate specific task detail queries
    queryClient.invalidateQueries({ queryKey: ['task-detail'] });

    // Invalidate arbiter announcement queries
    queryClient.invalidateQueries({ queryKey: ['arbiter-announcement'] });
  };

  return { invalidateAllCatallaxQueries };
}

export function useArbiterAnnouncements() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['catallax', 'arbiters'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      const events = await nostr.query([
        {
          kinds: [CATALLAX_KINDS.ARBITER_ANNOUNCEMENT],
          '#t': ['catallax'],
          limit: 300, // Increase limit to get all versions
        }
      ], { signal });

      const parsedAnnouncements = events
        .map(parseArbiterAnnouncement)
        .filter((announcement): announcement is ArbiterAnnouncement => announcement !== null);

      // Handle parameterized replaceable events - only keep the latest per pubkey+d combination
      const latestAnnouncements = new Map<string, ArbiterAnnouncement>();

      parsedAnnouncements.forEach(announcement => {
        const key = `${announcement.pubkey}:${announcement.d}`;
        const existing = latestAnnouncements.get(key);

        if (!existing || announcement.created_at > existing.created_at) {
          latestAnnouncements.set(key, announcement);
        }
      });

      return Array.from(latestAnnouncements.values())
        .sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
  });
}

export function useTaskProposals(status?: TaskStatus) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['catallax', 'tasks', status],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);

      // Don't filter by status in the query - get ALL task events and filter after deduplication
      // This ensures we get all versions of each task to find the latest status
      const filters = [
        {
          kinds: [CATALLAX_KINDS.TASK_PROPOSAL],
          '#t': ['catallax'],
          limit: 1000, // Increase limit significantly to ensure we get all versions
        }
      ];

      const events = await nostr.query(filters, { signal });

      console.log('Raw task events found:', events.length);
      console.log('Raw events by d-tag:', events.reduce((acc, e) => {
        const d = e.tags.find(([name]) => name === 'd')?.[1];
        const eventStatus = e.tags.find(([name]) => name === 'status')?.[1] || 'unknown';
        if (d) {
          if (!acc[d]) acc[d] = [];
          acc[d].push({ id: e.id.slice(0, 8), created_at: e.created_at, status: eventStatus, pubkey: e.pubkey.slice(0, 8) });
        }
        return acc;
      }, {} as Record<string, Array<{ id: string; created_at: number; status: string; pubkey: string }>>));

      // Log events sorted by created_at to see the order
      console.log('All events sorted by created_at (newest first):', events
        .sort((a, b) => b.created_at - a.created_at)
        .map(e => ({
          id: e.id.slice(0, 8),
          created_at: e.created_at,
          status: e.tags.find(([name]) => name === 'status')?.[1] || 'unknown',
          d: e.tags.find(([name]) => name === 'd')?.[1],
          date: new Date(e.created_at * 1000).toISOString()
        }))
      );

      const parsedTasks = events
        .map(parseTaskProposal)
        .filter((task): task is TaskProposal => task !== null);

      // Handle parameterized replaceable events - only keep the latest per patronPubkey+d combination
      // Note: task.pubkey should equal task.patronPubkey, but we use patronPubkey to be explicit
      const latestTasks = new Map<string, TaskProposal>();

      parsedTasks.forEach(task => {
        // Use patronPubkey+d as the key since patrons own their task proposals
        const key = `${task.patronPubkey}:${task.d}`;
        const existing = latestTasks.get(key);

        // Accept updates from patron, arbiter, or worker (all authorized parties)
        const isAuthorizedUpdater = task.pubkey === task.patronPubkey ||
                                   task.pubkey === task.arbiterPubkey ||
                                   task.pubkey === task.workerPubkey;

        if (!isAuthorizedUpdater) {
          console.warn('Ignoring task update from unauthorized party:', task.pubkey, 'task:', task.d);
          return;
        }

        if (!existing || task.created_at > existing.created_at) {
          latestTasks.set(key, task);
        }
      });

      let result = Array.from(latestTasks.values());

      // Apply status filter AFTER deduplication to ensure we have the latest status
      if (status) {
        result = result.filter(task => task.status === status);
      }

      result = result.sort((a, b) => b.created_at - a.created_at);

      console.log('useTaskProposals result:', result.map(t => ({ d: t.d, status: t.status, created_at: t.created_at, workerPubkey: t.workerPubkey })));

      return result;
    },
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
  });
}

export function useTaskConclusions() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['catallax', 'conclusions'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      const events = await nostr.query([
        {
          kinds: [CATALLAX_KINDS.TASK_CONCLUSION],
          limit: 200, // Increase limit to get more conclusions
        }
      ], { signal });

      console.log('Raw conclusion events found:', events.length);

      const conclusions = events
        .map((event, index) => {
          const parsed = parseTaskConclusion(event);
          if (!parsed) {
            console.log(`Failed to parse conclusion event ${index}:`, event);
          }
          return parsed;
        })
        .filter((conclusion): conclusion is TaskConclusion => conclusion !== null)
        .sort((a, b) => b.created_at - a.created_at);

      console.log('useTaskConclusions result:', conclusions.map(c => ({
        id: c.id,
        resolution: c.resolution,
        created_at: c.created_at,
        taskReference: c.taskReference
      })));

      return conclusions;
    },
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
  });
}

export function useMyArbiterServices(pubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['catallax', 'my-services', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      const events = await nostr.query([
        {
          kinds: [CATALLAX_KINDS.ARBITER_ANNOUNCEMENT],
          authors: [pubkey],
          '#t': ['catallax'],
          limit: 100, // Increase limit to get all versions
        }
      ], { signal });

      const parsedAnnouncements = events
        .map(parseArbiterAnnouncement)
        .filter((announcement): announcement is ArbiterAnnouncement => announcement !== null);

      // Handle parameterized replaceable events - only keep the latest per pubkey+d combination
      const latestAnnouncements = new Map<string, ArbiterAnnouncement>();

      parsedAnnouncements.forEach(announcement => {
        const key = `${announcement.pubkey}:${announcement.d}`;
        const existing = latestAnnouncements.get(key);

        if (!existing || announcement.created_at > existing.created_at) {
          latestAnnouncements.set(key, announcement);
        }
      });

      return Array.from(latestAnnouncements.values())
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
  });
}

export function useMyTasks(pubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['catallax', 'my-tasks', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);

      // Get ALL task events, not just those authored by this pubkey
      // This ensures we get updates from arbiters and workers too
      const events = await nostr.query([
        {
          kinds: [CATALLAX_KINDS.TASK_PROPOSAL],
          '#t': ['catallax'],
          limit: 1000, // Get all task events to ensure we have all versions
        }
      ], { signal });

      const parsedTasks = events
        .map(parseTaskProposal)
        .filter((task): task is TaskProposal => task !== null)
        // Filter to only tasks where this pubkey is the patron
        .filter(task => task.patronPubkey === pubkey);

      // Handle parameterized replaceable events - only keep the latest per patronPubkey+d combination
      const latestTasks = new Map<string, TaskProposal>();

      parsedTasks.forEach(task => {
        // Use patronPubkey+d as the key since patrons own their task proposals
        const key = `${task.patronPubkey}:${task.d}`;
        const existing = latestTasks.get(key);

        // Accept updates from patron, arbiter, or worker (all authorized parties)
        const isAuthorizedUpdater = task.pubkey === task.patronPubkey ||
                                   task.pubkey === task.arbiterPubkey ||
                                   task.pubkey === task.workerPubkey;

        if (!isAuthorizedUpdater) {
          console.warn('Ignoring task update from unauthorized party:', task.pubkey, 'task:', task.d);
          return;
        }

        console.log(`Deduplication for ${task.d}: existing=${existing?.created_at || 'none'}, current=${task.created_at}, status=${task.status}`);

        if (!existing || task.created_at > existing.created_at) {
          console.log(`Setting latest for ${task.d}: ${task.status} (${task.created_at})`);
          latestTasks.set(key, task);
        } else {
          console.log(`Keeping existing for ${task.d}: ${existing.status} (${existing.created_at})`);
        }
      });

      const result = Array.from(latestTasks.values())
        .sort((a, b) => b.created_at - a.created_at);

      console.log('useMyTasks result for', pubkey, ':', result.map(t => ({ d: t.d, status: t.status, created_at: t.created_at, workerPubkey: t.workerPubkey })));

      return result;
    },
    enabled: !!pubkey,
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
  });
}

export function useTasksForWorker(pubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['catallax', 'worker-tasks', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);

      // Get ALL task events to ensure we have all versions including updates from arbiters
      const events = await nostr.query([
        {
          kinds: [CATALLAX_KINDS.TASK_PROPOSAL],
          '#t': ['catallax'],
          limit: 1000, // Get all task events to ensure we have all versions
        }
      ], { signal });

      const parsedTasks = events
        .map(parseTaskProposal)
        .filter((task): task is TaskProposal => task !== null && task.workerPubkey === pubkey);

      // Handle parameterized replaceable events - only keep the latest per patronPubkey+d combination
      const latestTasks = new Map<string, TaskProposal>();

      parsedTasks.forEach(task => {
        // Use patronPubkey+d as the key since patrons own their task proposals
        const key = `${task.patronPubkey}:${task.d}`;
        const existing = latestTasks.get(key);

        // Accept updates from patron, arbiter, or worker (all authorized parties)
        const isAuthorizedUpdater = task.pubkey === task.patronPubkey ||
                                   task.pubkey === task.arbiterPubkey ||
                                   task.pubkey === task.workerPubkey;

        if (!isAuthorizedUpdater) {
          console.warn('Ignoring task update from unauthorized party:', task.pubkey, 'task:', task.d);
          return;
        }

        if (!existing || task.created_at > existing.created_at) {
          latestTasks.set(key, task);
        }
      });

      return Array.from(latestTasks.values())
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
  });
}

/**
 * Returns a map of arbiter pubkey -> number of completed tasks (successful or rejected resolutions)
 */
export function useArbiterExperience() {
  const { data: conclusions = [] } = useTaskConclusions();

  const experienceMap = new Map<string, number>();

  conclusions.forEach(conclusion => {
    // Only count successful or rejected as "completed" experience
    if (conclusion.arbiterPubkey && ['successful', 'rejected'].includes(conclusion.resolution)) {
      const current = experienceMap.get(conclusion.arbiterPubkey) || 0;
      experienceMap.set(conclusion.arbiterPubkey, current + 1);
    }
  });

  return experienceMap;
}

export function useTasksForArbiter(pubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['catallax', 'arbiter-tasks', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);

      // Get ALL task events to ensure we have all versions including updates from other parties
      const events = await nostr.query([
        {
          kinds: [CATALLAX_KINDS.TASK_PROPOSAL],
          '#t': ['catallax'],
          limit: 1000, // Get all task events to ensure we have all versions
        }
      ], { signal });

      const parsedTasks = events
        .map(parseTaskProposal)
        .filter((task): task is TaskProposal => task !== null && task.arbiterPubkey === pubkey);

      // Handle parameterized replaceable events - only keep the latest per patronPubkey+d combination
      const latestTasks = new Map<string, TaskProposal>();

      parsedTasks.forEach(task => {
        // Use patronPubkey+d as the key since patrons own their task proposals
        const key = `${task.patronPubkey}:${task.d}`;
        const existing = latestTasks.get(key);

        // Accept updates from patron, arbiter, or worker (all authorized parties)
        const isAuthorizedUpdater = task.pubkey === task.patronPubkey ||
                                   task.pubkey === task.arbiterPubkey ||
                                   task.pubkey === task.workerPubkey;

        if (!isAuthorizedUpdater) {
          console.warn('Ignoring task update from unauthorized party:', task.pubkey, 'task:', task.d);
          return;
        }

        if (!existing || task.created_at > existing.created_at) {
          latestTasks.set(key, task);
        }
      });

      return Array.from(latestTasks.values())
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 0, // Always consider data stale to ensure fresh queries
    refetchOnWindowFocus: true,
  });
}