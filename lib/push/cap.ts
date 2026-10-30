import { ESSENTIAL_PUSH_KINDS, PUSH_LIMITS, PUSH_PRIORITY, type PushKind } from '@/types/push'

export interface PushCandidate { memberId: string; kind: PushKind }
export interface PushHistoryEntry { today: number; week: number }
export type PushHistory = Record<string, PushHistoryEntry>

const isEssential = (k: PushKind) => ESSENTIAL_PUSH_KINDS.includes(k)
const IST_MS = 5.5 * 3600_000

export function inPushWindow(now: Date): boolean {
  const h = new Date(now.getTime() + IST_MS).getUTCHours()
  return h >= PUSH_LIMITS.quietEndHour && h < PUSH_LIMITS.quietStartHour
}

/**
 * Anti-spam: essential kinds always pass. Others are limited to perDay / perWeek per member
 * (counting what `history` says was already sent), highest priority first, and only inside the
 * 07:00-21:00 IST window. A member missing from `history` counts as nothing sent yet; callers that
 * could not read history (readPushHistory returned null) must not call this for non-essential kinds.
 */
export function pickPushesForDay(candidates: PushCandidate[], history: PushHistory, now: Date): PushCandidate[] {
  const out: PushCandidate[] = candidates.filter(c => isEssential(c.kind))
  if (!inPushWindow(now)) return out

  const byMember = new Map<string, PushCandidate[]>()
  for (const c of candidates) {
    if (isEssential(c.kind)) continue
    const list = byMember.get(c.memberId) ?? []
    list.push(c)
    byMember.set(c.memberId, list)
  }
  for (const [memberId, list] of byMember) {
    const h = history[memberId] ?? { today: 0, week: 0 }
    const room = Math.min(PUSH_LIMITS.perDay - h.today, PUSH_LIMITS.perWeek - h.week)
    if (room <= 0) continue
    list.sort((a, b) => PUSH_PRIORITY[a.kind] - PUSH_PRIORITY[b.kind])
    out.push(...list.slice(0, room))
  }
  return out
}

// ── Redis-backed history ─────────────────────────────────────

const redisConfigured = () => !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

function istDay(now: Date): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10).replace(/-/g, '')
}

/** ISO week label (YYYYWww) of the IST date. */
export function istIsoWeek(now: Date): string {
  const d = new Date(now.getTime() + IST_MS)
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}W${String(week).padStart(2, '0')}`
}

const dayKey = (memberId: string, now: Date) => `push:cap:d:${istDay(now)}:${memberId}`
const weekKey = (memberId: string, now: Date) => `push:cap:w:${istIsoWeek(now)}:${memberId}`

/**
 * Counts of non-essential pushes already sent. Returns null when Redis is unset or errors, so the
 * caller skips non-essential pushes instead of risking spam (essential kinds need no history).
 */
export async function readPushHistory(memberIds: string[], now = new Date()): Promise<PushHistory | null> {
  if (!redisConfigured()) return null
  if (memberIds.length === 0) return {}
  try {
    const { redis } = await import('@/lib/redis')
    const keys = memberIds.flatMap(id => [dayKey(id, now), weekKey(id, now)])
    const vals = await redis.mget<(number | string | null)[]>(...keys)
    const out: PushHistory = {}
    memberIds.forEach((id, i) => {
      out[id] = { today: Number(vals[i * 2] ?? 0), week: Number(vals[i * 2 + 1] ?? 0) }
    })
    return out
  } catch {
    return null
  }
}

/** Counts a sent non-essential push. Essential kinds are not counted. Never throws. */
export async function recordPush(memberId: string, kind: PushKind, now = new Date()): Promise<void> {
  if (isEssential(kind) || !redisConfigured()) return
  try {
    const { redis } = await import('@/lib/redis')
    const dk = dayKey(memberId, now)
    const wk = weekKey(memberId, now)
    await Promise.all([redis.incr(dk), redis.incr(wk)])
    await Promise.all([redis.expire(dk, 2 * 86400), redis.expire(wk, 8 * 86400)])
  } catch {
    /* best effort */
  }
}
