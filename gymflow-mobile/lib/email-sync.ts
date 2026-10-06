import { useEffect, useRef } from 'react';
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation';
import { useCachedQuery } from '@/lib/use-cached-query';
import { CacheKeys } from '@/lib/cache';
import { fetchEmailThreads, type EmailThreadsResponse } from '@/lib/api';

/**
 * One realtime subscription for the whole inbox.
 *
 * The server sends a payload-free 'admin:email' hint whenever a thread or message
 * changes. The inbox list, the tab badge and an open thread all want to react to it, but
 * they must not each subscribe: Supabase hands back the same channel for the same name,
 * and adding listeners to one that is already subscribed throws. So the subscription lives
 * once, in <EmailRealtime />, and the screens register a refresh callback here instead.
 */
type Refresher = () => Promise<void> | void;
const refreshers = new Set<Refresher>();

/**
 * Refresh everything that shows inbox data, in place. Used after our own actions (a
 * reply, an archive) rather than dropping cache keys, which would blank the list for a
 * moment before it refilled.
 */
export async function refreshEmailInbox(): Promise<void> {
  await Promise.allSettled([...refreshers].map(fn => fn()));
}

/** Called by a screen that shows inbox data. Returns the unregister function. */
export function registerEmailRefresher(fn: Refresher): () => void {
  refreshers.add(fn);
  return () => {
    refreshers.delete(fn);
  };
}

/** Keeps `fn` registered for as long as the calling component is mounted. */
export function useEmailRefresher(fn: Refresher) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => registerEmailRefresher(() => ref.current()), []);
}

/** Mount once while signed in. Renders nothing. */
export function EmailRealtime() {
  useRealtimeInvalidation({
    channelName: 'admin:email',
    // Every refresher runs; one failing must not stop the others.
    onInvalidate: refreshEmailInbox,
    refetchOnSubscribe: false,
  });
  return null;
}

/** The first page of the open inbox, shared by the list screen and the tab badge. */
export function useOpenEmailThreads() {
  const query = useCachedQuery<EmailThreadsResponse>({
    key: CacheKeys.emailThreads('open'),
    fetcher: () => fetchEmailThreads('open'),
  });
  useEmailRefresher(query.refresh);
  return query;
}
