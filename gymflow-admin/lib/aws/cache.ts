// Module-level TTL cache that also shares one in-flight promise between concurrent callers, so a
// burst of dashboard loads costs a single AWS call. Per-Lambda-instance only, which is fine here.
const store = new Map<string, { exp: number; value: unknown }>()
const inflight = new Map<string, Promise<unknown>>()

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.exp > Date.now()) return hit.value as T
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  const p = fn()
    .then((value) => {
      store.set(key, { exp: Date.now() + ttlMs, value })
      return value
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}
