import { getRedisClient } from '@/lib/redis'

/**
 * Token and request budgeting for the AI draft writer.
 *
 * Groq's free plan limits each model separately: per minute (requests and tokens) and per
 * day. The tightest is tokens per minute, so a draft must never be sent unless its
 * estimated size fits what is left. Everything here is "reserve before the call, correct
 * after it": reserving is what stops two drafts landing in the same minute from adding up
 * past the cap, and settling with the real usage keeps the counters honest.
 *
 * State lives in Upstash Redis so it is shared by every serverless instance. With no Redis
 * configured (local development) it falls back to per-process memory, which is enough to
 * test the logic and still enforces the budgets on a single instance.
 */

/** Rough token estimate. Over-counts on purpose: Tamil and symbols cost more per character. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

const memory = new Map<string, { n: number; exp: number }>()

function memIncrBy(key: string, by: number, ttlSec: number): number {
  const now = Date.now()
  const cur = memory.get(key)
  const entry = cur && cur.exp > now ? cur : { n: 0, exp: now + ttlSec * 1000 }
  entry.n += by
  memory.set(key, entry)
  return entry.n
}

async function incrBy(key: string, by: number, ttlSec: number): Promise<number> {
  const redis = getRedisClient()
  if (!redis) return memIncrBy(key, by, ttlSec)
  try {
    const n = await redis.incrby(key, by)
    // First write sets the expiry, so a counter cannot outlive its window.
    if (n === by) await redis.expire(key, ttlSec)
    return n
  } catch {
    // Redis down: fall back to memory rather than losing the safety net.
    return memIncrBy(key, by, ttlSec)
  }
}

const minuteSlot = () => Math.floor(Date.now() / 60_000)
const daySlot = () => new Date().toISOString().slice(0, 10)

export interface BudgetConfig {
  tpmBudget: number
  tpdBudget: number
  dailyDrafts: number
}

export function getBudgetConfig(): BudgetConfig {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : d
  }
  return {
    // Margins under Groq's 8K per minute and 200K per day, so the estimate being a little
    // off never turns into a rejected request.
    tpmBudget: num(process.env.AI_TPM_BUDGET, 6_000),
    tpdBudget: num(process.env.AI_TPD_BUDGET, 160_000),
    dailyDrafts: num(process.env.AI_DAILY_LIMIT, 50),
  }
}

/**
 * Reserve `tokens` for one call on `model`. Returns false, with nothing held, when either
 * the minute or the day budget would be exceeded: the caller then tries the next model.
 */
export async function reserveTokens(model: string, tokens: number, cfg: BudgetConfig): Promise<boolean> {
  const minuteKey = `ai:tpm:${model}:${minuteSlot()}`
  const dayKey = `ai:tpd:${model}:${daySlot()}`

  const minuteTotal = await incrBy(minuteKey, tokens, 120)
  if (minuteTotal > cfg.tpmBudget) {
    await incrBy(minuteKey, -tokens, 120)
    return false
  }
  const dayTotal = await incrBy(dayKey, tokens, 172_800)
  if (dayTotal > cfg.tpdBudget) {
    await incrBy(dayKey, -tokens, 172_800)
    await incrBy(minuteKey, -tokens, 120)
    return false
  }
  return true
}

/** After the call: replace the reservation with what was really used (or release it all). */
export async function settleTokens(model: string, reserved: number, actual: number | null): Promise<void> {
  if (actual === null || actual === reserved) return
  const diff = actual - reserved
  await incrBy(`ai:tpm:${model}:${minuteSlot()}`, diff, 120)
  await incrBy(`ai:tpd:${model}:${daySlot()}`, diff, 172_800)
}

/** Count one draft against the day's cap. False means the cap is reached (nothing is called). */
export async function takeDraftSlot(cfg: BudgetConfig): Promise<boolean> {
  const n = await incrBy(`ai:drafts:${daySlot()}`, 1, 172_800)
  if (n > cfg.dailyDrafts) {
    await incrBy(`ai:drafts:${daySlot()}`, -1, 172_800)
    return false
  }
  return true
}

/** Give a draft slot back, for a draft that never reached a model. */
export async function releaseDraftSlot(): Promise<void> {
  await incrBy(`ai:drafts:${daySlot()}`, -1, 172_800)
}

/**
 * One draft at a time per thread. A burst of messages in one thread, or a double tap on
 * Regenerate, would otherwise spend the budget several times for one answer.
 * Returns a release function, or null when another draft already holds the lock.
 */
export async function lockThread(threadId: string, ttlSec = 60): Promise<(() => Promise<void>) | null> {
  const key = `ai:lock:${threadId}`
  const redis = getRedisClient()
  if (!redis) {
    const n = memIncrBy(key, 1, ttlSec)
    if (n > 1) return null
    return async () => { memory.delete(key) }
  }
  try {
    const got = await redis.set(key, '1', { nx: true, ex: ttlSec })
    if (!got) return null
    return async () => { await redis.del(key).catch(() => {}) }
  } catch {
    return async () => {}
  }
}

/** Test hook: clear the in-memory fallback. */
export function resetBudgetMemory(): void {
  memory.clear()
}
