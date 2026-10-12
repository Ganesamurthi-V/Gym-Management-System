/**
 * Achievement helpers that sit AROUND the evaluator. Pure (no React, no I/O);
 * tested in __tests__/gamification/achievementsMerge.test.ts.
 *
 * The evaluator answers "is this met right now?". Two things it must not know:
 *  - a gym can override a badge's threshold (`badge_rules` in the gym's
 *    gamification settings), and
 *  - an unlock is permanent once recorded in `member_achievements`. Before that
 *    table existed a streak badge re-locked the morning after a missed day,
 *    because the unlock was re-derived from the current streak on every load.
 */

import { badgeThreshold } from '@/lib/gamification/settings'
import type { Achievement } from './types'

/** One row of `record_member_achievements`, camelCased. */
export interface RecordedAchievement {
  code: string
  /** ISO timestamp of the first unlock. */
  earnedAt: string | null
  /** true only on the call that inserted the row. */
  isNew: boolean
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-IN')
}

/**
 * Applies the gym's threshold override to one definition.
 *
 * Only definitions with a numeric requirement above 1 are overridable: 0 and 1
 * are yes/no badges ("activated the portal", "first check-in") where a different
 * number would contradict the badge's own name.
 *
 * The description carries the number too ("50 total check-ins"), so it is
 * rewritten to match; otherwise the card would promise one target and unlock at
 * another. When the built-in number does not appear in the text (e.g. "1 year"
 * for 365 days) the description is left alone.
 */
export function applyBadgeRule<T extends Pick<Achievement, 'id' | 'requirement' | 'description'>>(
  def: T,
  rules: Record<string, number> | null | undefined,
): T {
  if (def.requirement <= 1) return def
  const requirement = Math.trunc(badgeThreshold(rules, def.id, def.requirement))
  if (requirement === def.requirement || requirement < 1) return def

  // Whole number only: 100 must not match inside "1,100" or "1000".
  const original = new RegExp(`(?<![0-9]|[0-9],)${formatNumber(def.requirement)}(?![0-9]|,[0-9])`)
  return {
    ...def,
    requirement,
    description: def.description.replace(original, formatNumber(requirement)),
  }
}

/** Codes to send to `record_member_achievements`: everything met right now. */
export function unlockedCodes(achievements: readonly Achievement[]): string[] {
  return achievements.filter(a => a.unlocked).map(a => a.id)
}

/**
 * RPC `data` -> rows. Defensive because the result is untyped at the client and
 * this runs on a page that must render even if the RPC misbehaves.
 */
export function mapRecordedAchievements(data: unknown): RecordedAchievement[] {
  if (!Array.isArray(data)) return []
  const rows: RecordedAchievement[] = []
  for (const raw of data) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as { code?: unknown; earned_at?: unknown; is_new?: unknown }
    if (typeof r.code !== 'string' || r.code === '') continue
    rows.push({
      code: r.code,
      earnedAt: typeof r.earned_at === 'string' && r.earned_at !== '' ? r.earned_at : null,
      isNew: r.is_new === true,
    })
  }
  return rows
}

/**
 * Evaluated achievements + what the database has recorded.
 *
 *  - recorded            -> unlocked forever, with its earned date, even if the
 *                           stats no longer meet the requirement;
 *  - met but not recorded -> still unlocked. This is the path taken when the
 *                           recording call failed: the member must not lose a
 *                           badge on screen because a write did not go through;
 *  - neither             -> locked, untouched.
 *
 * Recorded codes with no matching definition (a retired badge) are ignored.
 * Order and every other field of `evaluated` are preserved.
 */
export function mergeRecordedAchievements(
  evaluated: readonly Achievement[],
  recorded: readonly RecordedAchievement[],
): Achievement[] {
  const byCode = new Map<string, RecordedAchievement>()
  for (const row of recorded) byCode.set(row.code, row)

  return evaluated.map(achievement => {
    const row = byCode.get(achievement.id)
    if (!row) return achievement
    return {
      ...achievement,
      unlocked: true,
      unlockedAt: row.earnedAt ?? achievement.unlockedAt,
      isNew: row.isNew,
    }
  })
}
