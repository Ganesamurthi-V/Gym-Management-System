/**
 * Pure candidate rules for the scheduled pushes. No I/O: the caller loads the facts (IST dates as
 * 'YYYY-MM-DD' strings) and `today` comes from todayIST(), so nothing here depends on the server's UTC day.
 * Copy carries no numbers or weights (lock screens are public); see PUSH_COPY.
 */
import { dayNumber } from '@/lib/progress/chart'
import { weighInDue, measurementsDue, daysSince } from '@/lib/progress/report'
import { addDays, buildPlan } from '@/lib/progress/plan'
import { quoteForDate } from '@/lib/member/daily-quote'
import type { BodyGoal, BodyLog } from '@/types/progress'
import type { PushJob, PushKind } from '@/types/push'
import { PUSH_COPY } from './payload'

export interface DuePush {
  memberId: string
  kind: PushKind
  /** Dedupe reference; the sender keys on push:{kind}:{ref}:{memberId}. */
  ref: string
  body: string
  url: string
}

export interface MemberPushFacts {
  memberId: string
  /** Latest membership end_date (any row), null when the member has none. */
  latestEnd: string | null
  /** Present only when the member set up body progress (a member_body_profile row). */
  profile: { goal: BodyGoal; heightCm: number; targetWeightKg: number | null; targetDate: string | null } | null
  logs: BodyLog[]
  /** Most recent attendance `date`, null = never attended. */
  lastAttendance: string | null
}

/** 0 = Sunday ... 6 = Saturday, of a calendar date string (no timezone shift). */
export function weekdayOf(date: string): number {
  return new Date(dayNumber(date) * 86_400_000).getUTCDay()
}

/** ISO week label YYYYWww of a calendar date string. Matches istIsoWeek() in cap.ts. */
export function isoWeekOf(date: string): string {
  const t = new Date(dayNumber(date) * 86_400_000)
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}W${String(week).padStart(2, '0')}`
}

/** 5-day bucket of the date: miss_you goes out at most once per bucket per member. */
export const missYouBucket = (today: string): number => Math.floor(dayNumber(today) / 5)

export function dueForMember(f: MemberPushFacts, today: string): DuePush[] {
  const out: DuePush[] = []
  const add = (kind: PushKind, ref: string, body: string, url: string) =>
    out.push({ memberId: f.memberId, kind, ref, body, url })
  const active = f.latestEnd !== null && f.latestEnd >= today

  // 1. Expiring: exactly 3 or 1 day before the latest end date.
  if (active && f.latestEnd) {
    const left = dayNumber(f.latestEnd) - dayNumber(today)
    if (left === 3) add('expiring', `${f.latestEnd}-d3`, PUSH_COPY.expiring(3), '/m/membership/renew')
    else if (left === 1) add('expiring', `${f.latestEnd}-d1`, PUSH_COPY.expiring(1), '/m/membership/renew')
  }

  // 2-4. Body progress: only for members who set it up, and nothing if they logged today.
  if (f.profile && !f.logs.some(l => l.loggedOn === today)) {
    if (weighInDue(f.logs, today)) add('weigh_in', isoWeekOf(today), PUSH_COPY.weighIn, '/m/progress/body')
    if (measurementsDue(f.logs, today)) add('measurements', today.slice(0, 7), PUSH_COPY.measurements, '/m/progress/body')

    const { targetDate, targetWeightKg } = f.profile
    if (targetDate && targetWeightKg != null) {
      const weights = f.logs
        .filter(l => l.weightKg != null)
        .sort((a, b) => a.loggedOn.localeCompare(b.loggedOn))
      const first = weights[0]
      const last = weights[weights.length - 1]
      const plan = first && last
        ? buildPlan({
            goal: f.profile.goal, heightCm: f.profile.heightCm,
            startWeightKg: first.weightKg as number, startDate: first.loggedOn,
            currentWeightKg: last.weightKg as number, targetWeightKg, targetDate,
          }, today)
        : null
      if (plan?.verdict === 'reached') add('goal', `reached-${targetDate}`, PUSH_COPY.goalReached, '/m/progress/body')
      else if (targetDate === addDays(today, 7)) add('goal', `near-${targetDate}`, PUSH_COPY.goalDateNear, '/m/progress/body')
    }
  }

  // 5. We miss you: active membership, last attendance 3+ days ago; never attended = skip.
  if (active && f.lastAttendance && daysSince(f.lastAttendance, today) >= 3) {
    const bucket = missYouBucket(today)
    add('miss_you', `b${bucket}`, PUSH_COPY.missYou(seedOf(f.memberId) + bucket), '/m/attendance')
  }

  // 6. Weekly quote: Mondays only.
  if (active && weekdayOf(today) === 1) add('weekly_quote', isoWeekOf(today), PUSH_COPY.weeklyQuote(quoteForDate(today)), '/m/home')

  return out
}

/** Stable small number from a member id so copy rotates per member without randomness. */
export function seedOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Max members per published job (one QStash message each). */
export const PUSH_JOB_MEMBER_CHUNK = 200

/**
 * One job per (kind, ref, body, url), split into chunks of PUSH_JOB_MEMBER_CHUNK. Members of a later chunk
 * get a `.cN` suffix on `ref` because publishPushJob's QStash dedup id is push-{kind}-{ref}-{gym}; the
 * chunks hold different members, so the per-member sender key stays unique.
 */
export function groupIntoJobs(gymId: string, picked: DuePush[]): PushJob[] {
  const groups = new Map<string, { first: DuePush; ids: string[] }>()
  for (const p of picked) {
    const key = [p.kind, p.ref, p.body, p.url].join('|')
    const g = groups.get(key) ?? { first: p, ids: [] }
    g.ids.push(p.memberId)
    groups.set(key, g)
  }
  const jobs: PushJob[] = []
  for (const { first, ids } of groups.values()) {
    ids.sort()
    for (let i = 0; i < ids.length; i += PUSH_JOB_MEMBER_CHUNK) {
      const n = i / PUSH_JOB_MEMBER_CHUNK
      jobs.push({
        gymId, kind: first.kind, ref: n === 0 ? first.ref : `${first.ref}.c${n}`,
        memberIds: ids.slice(i, i + PUSH_JOB_MEMBER_CHUNK), body: first.body, url: first.url,
      })
    }
  }
  return jobs
}
