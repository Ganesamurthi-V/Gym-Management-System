import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { istToday } from '@/lib/gamification/periods'
import { addDays } from '@/lib/progress/plan'
import { mapBodyLogRow } from '@/lib/progress/validate'
import type { BodyGoal, BodyLog } from '@/types/progress'
import { pickPushesForDay, readPushHistory } from './cap'
import { publishPushJob } from './publish'
import { dueForMember, groupIntoJobs, type DuePush, type MemberPushFacts } from './rules'

const PAGE = 1000
const ID_CHUNK = 100
/** Attendance older than this is not read: a member absent for 45+ days is treated like "never attended" (no nudge). */
const ATTENDANCE_LOOKBACK_DAYS = 45
const IST_MS = 5.5 * 3600_000

type Page = { data: Record<string, unknown>[] | null; error: { message: string } | null }

/** Reads every row of a query in pages. Throws on a Supabase error so a failed read is never an empty list. */
async function readAll(build: (from: number, to: number) => PromiseLike<Page>): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Subscribed member ids per gym. Server-side read with the service role; nothing comes from a request. */
export async function loadSubscribersByGym(db: SupabaseClient): Promise<Map<string, string[]>> {
  const rows = await readAll((from, to) =>
    db.from('member_push_subscriptions').select('gym_id, member_id').order('id').range(from, to))
  const byGym = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = byGym.get(String(r.gym_id)) ?? new Set<string>()
    set.add(String(r.member_id))
    byGym.set(String(r.gym_id), set)
  }
  return new Map([...byGym].map(([g, s]) => [g, [...s]]))
}

/** Applies the anti-spam cap and publishes one job per (kind, ref, body, chunk). Returns members queued. */
export async function capAndPublish(gymId: string, candidates: DuePush[], now: Date): Promise<number> {
  if (candidates.length === 0) return 0
  const history = await readPushHistory([...new Set(candidates.map(c => c.memberId))], now)
  if (history === null) {
    // Redis unavailable: every kind built here is non-essential, so send nothing rather than risk spam.
    logger.warn('push_no_history', { gymId })
    return 0
  }
  const picked = pickPushesForDay(candidates, history, now) as DuePush[]
  for (const job of groupIntoJobs(gymId, picked)) await publishPushJob(job)
  return picked.length
}

async function loadFacts(
  db: SupabaseClient, gymId: string, memberIds: string[], today: string,
): Promise<{ facts: MemberPushFacts[]; openedToday: Set<string> }> {
  const latestEnd = new Map<string, string>()
  const lastAttendance = new Map<string, string>()
  const profiles = new Map<string, NonNullable<MemberPushFacts['profile']>>()
  const logs = new Map<string, BodyLog[]>()
  const openedToday = new Set<string>()
  const since = addDays(today, -ATTENDANCE_LOOKBACK_DAYS)

  for (const ids of chunk(memberIds, ID_CHUNK)) {
    const [members, ships, att, profs] = await Promise.all([
      readAll((f, t) => db.from('members').select('id, last_portal_login').eq('gym_id', gymId).in('id', ids).order('id').range(f, t)),
      readAll((f, t) => db.from('memberships').select('id, member_id, end_date').eq('gym_id', gymId).in('member_id', ids).order('id').range(f, t)),
      readAll((f, t) => db.from('attendance').select('id, member_id, date').eq('gym_id', gymId).in('member_id', ids).gte('date', since).order('id').range(f, t)),
      readAll((f, t) => db.from('member_body_profile').select('member_id, goal, height_cm, target_weight_kg, target_date').eq('gym_id', gymId).in('member_id', ids).order('member_id').range(f, t)),
    ])
    for (const m of members) {
      const at = m.last_portal_login as string | null
      if (at && new Date(new Date(at).getTime() + IST_MS).toISOString().slice(0, 10) === today) openedToday.add(String(m.id))
    }
    for (const s of ships) {
      const id = String(s.member_id), end = String(s.end_date)
      if (!latestEnd.has(id) || end > (latestEnd.get(id) as string)) latestEnd.set(id, end)
    }
    for (const a of att) {
      const id = String(a.member_id), d = String(a.date)
      if (!lastAttendance.has(id) || d > (lastAttendance.get(id) as string)) lastAttendance.set(id, d)
    }
    const profileIds: string[] = []
    for (const p of profs) {
      const id = String(p.member_id)
      profileIds.push(id)
      profiles.set(id, {
        goal: p.goal as BodyGoal,
        heightCm: Number(p.height_cm),
        targetWeightKg: p.target_weight_kg == null ? null : Number(p.target_weight_kg),
        targetDate: p.target_date == null ? null : String(p.target_date),
      })
    }
    if (profileIds.length) {
      const rows = await readAll((f, t) =>
        db.from('member_body_logs').select('id, member_id, logged_on, weight_kg, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm')
          .eq('gym_id', gymId).in('member_id', profileIds).order('id').range(f, t))
      for (const r of rows) {
        const id = String(r.member_id)
        const list = logs.get(id) ?? []
        list.push(mapBodyLogRow(r))
        logs.set(id, list)
      }
    }
  }

  return {
    openedToday,
    facts: memberIds.map(id => ({
      memberId: id,
      latestEnd: latestEnd.get(id) ?? null,
      profile: profiles.get(id) ?? null,
      logs: logs.get(id) ?? [],
      lastAttendance: lastAttendance.get(id) ?? null,
    })),
  }
}

/**
 * Daily scheduled pushes (expiring, body progress, we-miss-you, weekly quote), run as a step of the 09:00 IST
 * WhatsApp cron. Never throws: a failure is logged and the counts so far are returned. Whether the gym's plan
 * allows the member app is enforced by the sender (sendPushToMembers) and the cap is only counted on a real send.
 * "Already opened the app today" uses members.last_portal_login (written by record_member_login).
 */
export async function runDailyPushStep(
  now: Date = new Date(), opts: { db?: SupabaseClient } = {},
): Promise<{ considered: number; queued: number }> {
  let considered = 0
  let queued = 0
  try {
    const db = opts.db ?? createAdminClient()
    const today = istToday(now)
    const subscribers = await loadSubscribersByGym(db)
    for (const [gymId, memberIds] of subscribers) {
      try {
        const { facts, openedToday } = await loadFacts(db, gymId, memberIds, today)
        const candidates = facts.filter(f => !openedToday.has(f.memberId)).flatMap(f => dueForMember(f, today))
        considered += candidates.length
        queued += await capAndPublish(gymId, candidates, now)
      } catch (err) {
        logger.error('push_daily_gym_failed', { gymId, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } catch (err) {
    logger.error('push_daily_failed', { error: err instanceof Error ? err.message : String(err) })
  }
  return { considered, queued }
}
