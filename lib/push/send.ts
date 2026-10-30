import 'server-only'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { gymIsWritable, planAllowsMemberApp } from '@/lib/subscription-utils'
import { getTrialEligibleMemberIds } from '@/lib/member/trialEligibility'
import { logger } from '@/lib/logger'
import { PUSH_LIMITS, PUSH_TTL_SECONDS, type PushJob } from '@/types/push'
import { configureWebPush } from './config'
import { isAllowedPushEndpoint } from './validate'
import { buildPushPayload } from './payload'
import { recordPush } from './cap'

export const PUSH_TIME_BUDGET_MS = 40_000
const PAGE_SIZE = 100
const CONCURRENCY = 10
const DEDUPE_TTL_SECONDS = 48 * 3600

export interface PushSendResult {
  sent: number
  removed: number
  failed: number
  /** Set when the time budget ran out (or the page was not the last): re-publish the job with this cursor. */
  nextCursor?: string
}

interface SubRow {
  id: string
  member_id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

const redisConfigured = () => !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

let redisModule: Promise<typeof import('@/lib/redis')> | null = null
/** One dynamic import shared by the concurrent member sends. */
const getRedis = () => (redisModule ??= import('@/lib/redis')).then(m => m.redis)

/** SET NX per member so retries and double clicks never double-notify. Fails open when Redis is unavailable. */
async function claimDedupe(key: string): Promise<boolean> {
  if (!redisConfigured()) return true
  try {
    const redis = await getRedis()
    return (await redis.set(key, '1', { nx: true, ex: DEDUPE_TTL_SECONDS })) === 'OK'
  } catch {
    return true
  }
}

async function releaseDedupe(key: string): Promise<void> {
  if (!redisConfigured()) return
  try {
    const redis = await getRedis()
    await redis.del(key)
  } catch { /* the 48 h expiry cleans it up */ }
}

/**
 * Sends one job to the gym's subscribed members. The gym comes from the (server-resolved) job, never
 * from a member. Members are processed whole (all their devices together) in order of member id, so
 * `nextCursor` is simply the last member finished.
 */
export async function sendPushToMembers(
  job: PushJob,
  opts: { budgetMs?: number; db?: SupabaseClient; now?: () => number } = {},
): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, removed: 0, failed: 0 }
  if (!configureWebPush()) return result

  const now = opts.now ?? Date.now
  const deadline = now() + (opts.budgetMs ?? PUSH_TIME_BUDGET_MS)
  const db = opts.db ?? createAdminClient()

  // Same rule as member_app_allowed(), at gym level: gym writable, plan includes the member app, and on a
  // trial only the first PLAN_MEMBER_LIMIT members. Read fresh, never cached.
  const { data: gym, error: gymError } = await db
    .from('gyms')
    .select('name, plan_type, is_active, subscription_status, trial_ends_at, subscription_ends_at')
    .eq('id', job.gymId)
    .maybeSingle()
  if (gymError || !gym) {
    logger.error('push_gym_read_failed', { error: gymError?.message })
    return result
  }
  if (!gymIsWritable(gym) || !planAllowsMemberApp(gym.plan_type)) return result
  let trialEligible: Set<string> | null = null
  if (gym.plan_type === 'trial') {
    try { trialEligible = await getTrialEligibleMemberIds(db, job.gymId) } catch (err) {
      logger.error('push_trial_eligibility_failed', { error: err instanceof Error ? err.message : String(err) })
      return result
    }
  }

  let cursor = job.cursor
  for (;;) {
    if (now() >= deadline) { result.nextCursor = cursor; return result }

    let q = db
      .from('member_push_subscriptions')
      .select('id, member_id, endpoint, p256dh, auth, failure_count')
      .eq('gym_id', job.gymId)
    if (job.memberIds) q = q.in('member_id', job.memberIds)
    if (cursor) q = q.gt('member_id', cursor)
    const { data, error } = await q.order('member_id').order('id').limit(PAGE_SIZE)
    if (error) {
      logger.error('push_subscriptions_read_failed', { error: error.message })
      result.nextCursor = cursor
      return result
    }
    let rows = (data ?? []) as SubRow[]
    if (rows.length === 0) return result

    // A full page may have cut a member's devices in half: hold the last member back for the next page.
    const full = rows.length === PAGE_SIZE
    if (full) {
      const lastMember = rows[rows.length - 1].member_id
      const kept = rows.filter(r => r.member_id !== lastMember)
      if (kept.length > 0) rows = kept
    }

    const byMember = new Map<string, SubRow[]>()
    for (const r of rows) {
      if (trialEligible && !trialEligible.has(r.member_id)) continue
      const list = byMember.get(r.member_id) ?? []
      list.push(r)
      byMember.set(r.member_id, list)
    }
    const memberIds = [...byMember.keys()]
    const pageLastMember = rows[rows.length - 1].member_id

    for (let i = 0; i < memberIds.length; i += CONCURRENCY) {
      if (now() >= deadline) {
        result.nextCursor = i === 0 ? cursor : memberIds[i - 1]
        return result
      }
      const chunk = memberIds.slice(i, i + CONCURRENCY)
      await Promise.all(chunk.map(memberId => sendToMember(db, job, gym.name ?? '', memberId, byMember.get(memberId)!, result)))
    }

    cursor = pageLastMember
    if (!full) return result
  }
}

async function sendToMember(
  db: SupabaseClient,
  job: PushJob,
  gymName: string,
  memberId: string,
  subs: SubRow[],
  result: PushSendResult,
): Promise<void> {
  const dedupeKey = `push:${job.kind}:${job.ref}:${memberId}`
  if (!(await claimDedupe(dedupeKey))) return

  const payload = JSON.stringify(buildPushPayload(job.kind, { gymName, body: job.body, url: job.url, tag: job.tag }))
  let delivered = 0
  let transientFailures = 0

  for (const sub of subs) {
    // SSRF defence: the endpoint was member-supplied, so it is checked again at the moment of sending.
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      await db.from('member_push_subscriptions').delete().eq('id', sub.id)
      result.removed++
      continue
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: PUSH_TTL_SECONDS[job.kind], urgency: 'normal', timeout: 10_000 },
      )
      delivered++
      result.sent++
      const { error } = await db
        .from('member_push_subscriptions')
        .update({ failure_count: 0, last_success_at: new Date().toISOString() })
        .eq('id', sub.id)
      if (error) logger.warn('push_success_update_failed', { error: error.message })
    } catch (err) {
      const status = (err as { statusCode?: number } | null)?.statusCode
      if (status === 404 || status === 410) {
        await db.from('member_push_subscriptions').delete().eq('id', sub.id)
        result.removed++
        continue
      }
      result.failed++
      transientFailures++
      const failures = sub.failure_count + 1
      if (failures >= PUSH_LIMITS.failuresBeforeDelete) {
        await db.from('member_push_subscriptions').delete().eq('id', sub.id)
        result.removed++
      } else {
        await db.from('member_push_subscriptions').update({ failure_count: failures }).eq('id', sub.id)
      }
      logger.warn('push_send_failed', { status: status ?? null, kind: job.kind })
    }
  }

  if (delivered > 0) await recordPush(memberId, job.kind)
  // Nothing reached any device because of transient errors: let a retry try again.
  else if (transientFailures > 0) await releaseDedupe(dedupeKey)
}
