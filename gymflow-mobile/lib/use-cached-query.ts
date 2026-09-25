import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  hydrate, isFresh, peek, revalidate, subscribe,
} from './cache';

type Options<T> = {
  /** Cache key. Screens sharing a key share the value and re-render together. */
  key: string;
  fetcher: () => Promise<T>;
  /**
   * How long a value counts as fresh. Inside this window a screen focus paints
   * from cache and skips the network entirely, which is what makes tab switching
   * free. Outside it, the cached value still paints immediately and the refresh
   * happens behind it.
   */
  ttlMs?: number;
  enabled?: boolean;
};

type Result<T> = {
  data: T | undefined;
  /** True only when there is nothing to draw yet. Never true once cached. */
  loading: boolean;
  /** A refresh is running behind data already on screen. For a subtle indicator. */
  validating: boolean;
  error: string | null;
  /** Explicit user-driven refresh (pull-to-refresh); always hits the network. */
  refresh: () => Promise<void>;
};

/**
 * Cache-first data for a screen.
 *
 * The important difference from the previous `useFocusEffect(load)` pattern is
 * what happens on the *first* render of a pushed screen: this returns whatever
 * is cached synchronously, so the screen can paint real content in the same frame
 * the navigator animates it in. Only a genuine cache miss shows a loading state.
 */
export function useCachedQuery<T>({ key, fetcher, ttlMs = 30_000, enabled = true }: Options<T>): Result<T> {
  // Seeded from the cache during the first render, not in an effect — an effect
  // would paint one empty frame first, which is the flash this is meant to remove.
  const [data, setData] = useState<T | undefined>(() => peek<T>(key)?.data);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Re-read on every notification for this key, so a write from another screen
  // (or a mutation) updates this one without either knowing about the other.
  useEffect(() => subscribe(key, () => setData(peek<T>(key)?.data)), [key]);

  // Adopt any value left on disk by a previous app run. Only matters on cold
  // start; once memory has the key this is a no-op.
  useEffect(() => {
    if (!enabled) return;
    if (peek<T>(key)) return;
    void hydrate(key);
  }, [key, enabled]);

  const run = useCallback(async (force: boolean) => {
    if (!enabled) return;
    if (!force && isFresh(key, ttlMs)) return;
    setValidating(true);
    try {
      await revalidate(key, () => fetcherRef.current());
      setError(null);
    } catch (e: any) {
      // Keep whatever is displayed. A failed background refresh should surface as
      // a banner, not as a screen that empties itself.
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setValidating(false);
    }
  }, [key, ttlMs, enabled]);

  // Revalidate on focus, subject to the TTL. Cheap when warm, correct when stale.
  useFocusEffect(useCallback(() => { void run(false); }, [run]));

  const refresh = useCallback(() => run(true), [run]);

  return {
    data,
    /*
      Nothing to draw and nothing has failed yet, so a load is either running or
      about to. Deliberately not `data === undefined && validating`: `validating`
      is still false during the very first render (the focus effect has not run),
      which would report "not loading" for one frame and let the screen flash its
      empty state before the spinner.
    */
    loading: data === undefined && error === null,
    validating,
    error,
    refresh,
  };
}
