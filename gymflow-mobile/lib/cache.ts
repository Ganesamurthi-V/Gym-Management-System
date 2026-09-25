import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Stale-while-revalidate cache for the admin API.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Every screen used to call its loader from `useFocusEffect` and gate the first
 * paint behind a full-screen `ActivityIndicator`. Because each screen kept its
 * data in local `useState`, nothing survived a screen being popped and nothing
 * was shared between screens, so:
 *
 *   - pushing GymDetail always mounted fresh, so it always showed a spinner for
 *     the length of a round-trip — that is the 3-4s "transition"
 *   - switching tabs re-fetched even if the data was seconds old
 *   - a cold app start showed spinners everywhere, with nothing on disk
 *
 * Measured, the transport is not the problem: the admin API answers in ~85ms
 * warm (~490ms cold). The delay was the app choosing to wait for the network
 * before drawing anything.
 *
 * So reads are served from memory first, then from disk, and the network only
 * ever updates what is already on screen. A transition now paints with the data
 * it had a moment ago and quietly corrects itself, which is what makes a native
 * app feel instant.
 *
 * ── Deliberately not a library ──────────────────────────────────────────────
 * React Query would do this and more, but it is a dependency plus a provider in
 * an app whose entire data layer is seven `apiClient.get` calls. This file is
 * the ~10% of it that those seven calls need.
 */

type Entry<T> = {
  data: T;
  /** When the value was written, as epoch ms. */
  storedAt: number;
};

type Listener = () => void;

/** Live values, keyed by cache key. Survives screen unmounts; cleared on sign-out. */
const memory = new Map<string, Entry<unknown>>();

/**
 * In-flight requests, keyed the same way. A second caller for a key that is
 * already loading joins the existing promise instead of firing its own request —
 * this is what stops the focus fetch and the realtime hint from both hitting the
 * network on mount.
 */
const inflight = new Map<string, Promise<unknown>>();

/** Per-key subscribers, so every mounted screen sharing a key re-renders together. */
const listeners = new Map<string, Set<Listener>>();

const DISK_PREFIX = 'gfcache:';

/** Keys already read from disk, so the async hydrate is attempted only once each. */
const hydrated = new Set<string>();

function emit(key: string) {
  const subs = listeners.get(key);
  if (!subs) return;
  for (const fn of subs) fn();
}

export function subscribe(key: string, fn: Listener): () => void {
  let subs = listeners.get(key);
  if (!subs) {
    subs = new Set();
    listeners.set(key, subs);
  }
  subs.add(fn);
  return () => {
    subs!.delete(fn);
    if (subs!.size === 0) listeners.delete(key);
  };
}

export function peek<T>(key: string): Entry<T> | undefined {
  return memory.get(key) as Entry<T> | undefined;
}

export function write<T>(key: string, data: T) {
  const entry: Entry<T> = { data, storedAt: Date.now() };
  memory.set(key, entry);
  emit(key);
  // Fire-and-forget: a failed disk write costs a cold-start paint, never correctness.
  AsyncStorage.setItem(DISK_PREFIX + key, JSON.stringify(entry)).catch(() => {});
}

/**
 * Pull a key off disk into memory. Returns true if anything was adopted.
 *
 * A disk value never overwrites a newer in-memory one: hydration races the first
 * network response, and on a fast connection the response can land first.
 */
export async function hydrate(key: string): Promise<boolean> {
  if (hydrated.has(key)) return false;
  hydrated.add(key);
  try {
    const raw = await AsyncStorage.getItem(DISK_PREFIX + key);
    if (!raw) return false;
    const entry = JSON.parse(raw) as Entry<unknown>;
    if (!entry || typeof entry.storedAt !== 'number') return false;
    const current = memory.get(key);
    if (current && current.storedAt >= entry.storedAt) return false;
    memory.set(key, entry);
    emit(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `fetcher` for `key`, deduped against any request already in flight, and
 * store the result. Rejections propagate to the caller but leave the cached
 * value in place — a failed refresh must not blank a screen that already has
 * data on it.
 */
export function revalidate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      const data = await fetcher();
      write(key, data);
      return data;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export function isFresh(key: string, ttlMs: number): boolean {
  const entry = memory.get(key);
  return !!entry && Date.now() - entry.storedAt < ttlMs;
}

/** Drop one key, or everything when called with no argument (used on sign-out). */
export function invalidate(key?: string) {
  if (key) {
    memory.delete(key);
    hydrated.delete(key);
    emit(key);
    AsyncStorage.removeItem(DISK_PREFIX + key).catch(() => {});
    return;
  }
  const keys = [...memory.keys()];
  memory.clear();
  hydrated.clear();
  for (const k of keys) emit(k);
  AsyncStorage.getAllKeys()
    .then(all => AsyncStorage.multiRemove(all.filter(k => k.startsWith(DISK_PREFIX))))
    .catch(() => {});
}

/** Cache keys, centralised so screens and mutations cannot disagree on spelling. */
export const CacheKeys = {
  dashboard: 'dashboard',
  gyms: 'gyms',
  gymDetail: (id: string) => `gym:${id}`,
  tickets: 'tickets',
  logs: 'logs',
  subscription: (id: string) => `subscription:${id}`,
} as const;
