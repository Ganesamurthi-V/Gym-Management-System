// Simple in-memory token bucket per key (client IP).
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>()

  constructor(
    private capacity = 60,
    private refillPerSec = 5,
    private now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const t = this.now()
    if (this.buckets.size > 10_000) this.prune(t)
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: t }
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.at) / 1000) * this.refillPerSec)
    b.at = t
    const ok = b.tokens >= 1
    if (ok) b.tokens -= 1
    this.buckets.set(key, b)
    return ok
  }

  private prune(t: number) {
    for (const [k, b] of this.buckets) if (t - b.at > 60_000) this.buckets.delete(k)
  }
}
