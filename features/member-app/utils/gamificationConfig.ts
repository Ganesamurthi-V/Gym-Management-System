/**
 * features/member-app/utils/gamificationConfig.ts
 *
 * Pure helpers behind the owner's Gamification tab: form <-> settings mapping,
 * validation, one-line card summaries, prize period labels and leader picking.
 *
 * Kept free of React, Next and Supabase imports on purpose: the editors are
 * thin shells around these functions, so the rules are unit-tested in
 * __tests__/gamification/ownerConfig.test.ts without rendering anything, and the
 * server actions re-run the same validation on what the browser sends.
 */

import type { z } from 'zod'
import {
  BOARD_WINDOW_DAYS,
  DEFAULT_GAMIFICATION_SETTINGS,
  LEADERBOARD_BOARD_LABELS,
  SETTINGS_LIMITS as L,
} from '@/lib/gamification/constants'
import { isLeaderboardBoard } from '@/lib/gamification/mapLeaderboard'
import { isValidDateString, istDateOf, rollingWindow } from '@/lib/gamification/periods'
import {
  badgeRulesSchema,
  gamificationSettingsPatchSchema,
  settingsToRow,
  xpMultiplierSchema,
  type GamificationSettingsPatch,
  type GamificationSettingsRow,
} from '@/lib/gamification/settings'
import type { GamificationSettings, LeaderboardRow, XpMultiplier } from '@/lib/gamification/types'
import type { GamificationAward } from '@/types/member-app'
import { ACHIEVEMENT_DEFINITIONS } from '@/lib/member/achievements/definitions'
import type { AchievementCategory } from '@/lib/member/achievements/types'

// ─── Shared ──────────────────────────────────────────────────────────────────

export type FieldErrors = Record<string, string>

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors }

/**
 * zod issues -> one message per field, keyed by the dotted path.
 *
 * `fallbacks` replaces zod's generic range text ("Too small: expected number to
 * be >=1") for the numeric fields, where the owner needs the allowed range
 * rather than a parser message. Fields without a fallback keep the message the
 * schema author wrote (e.g. "End date must be on or after the start date").
 */
export function fieldErrors(error: z.ZodError, fallbacks: FieldErrors = {}): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    // Fallbacks are looked up by the full path, then by the top-level field.
    const top = String(issue.path[0] ?? '_')
    if (key in out) continue
    out[key] = fallbacks[key] ?? fallbacks[top] ?? issue.message
  }
  return out
}

/** "" / whitespace -> NaN, so an empty box fails validation instead of becoming 0. */
function toNumber(raw: string): number {
  const trimmed = raw.trim()
  return trimmed === '' ? Number.NaN : Number(trimmed)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * 'YYYY-MM-DD' -> "20 Oct 2026". Built from the string parts rather than a Date
 * so the result cannot shift a day in a browser that is not on IST.
 */
export function formatDay(date: string, withYear = true): string {
  if (!isValidDateString(date)) return date
  const [y, m, d] = date.split('-')
  const base = `${Number(d)} ${MONTHS[Number(m) - 1]}`
  return withYear ? `${base} ${y}` : base
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

// ─── XP: base values ─────────────────────────────────────────────────────────

export interface XpBaseForm {
  xpPerCheckin: string
  xpPerRenewal: string
  xpPortalActivation: string
}

export type XpBase = Pick<GamificationSettings, 'xpPerCheckin' | 'xpPerRenewal' | 'xpPortalActivation'>

export function xpBaseToForm(settings: XpBase): XpBaseForm {
  return {
    xpPerCheckin: String(settings.xpPerCheckin),
    xpPerRenewal: String(settings.xpPerRenewal),
    xpPortalActivation: String(settings.xpPortalActivation),
  }
}

const wholeRange = (r: { min: number; max: number }) => `Enter a whole number from ${r.min} to ${r.max}`

export function parseXpBaseForm(form: XpBaseForm): Parsed<XpBase> {
  const parsed = gamificationSettingsPatchSchema.safeParse({
    xpPerCheckin: toNumber(form.xpPerCheckin),
    xpPerRenewal: toNumber(form.xpPerRenewal),
    xpPortalActivation: toNumber(form.xpPortalActivation),
  })
  if (!parsed.success) {
    return {
      ok: false,
      errors: fieldErrors(parsed.error, {
        xpPerCheckin: wholeRange(L.xpPerCheckin),
        xpPerRenewal: wholeRange(L.xpPerRenewal),
        xpPortalActivation: wholeRange(L.xpPortalActivation),
      }),
    }
  }
  return { ok: true, value: parsed.data as XpBase }
}

// ─── XP: bonus rules (multipliers) ───────────────────────────────────────────

/** Monday first, because that is how a gym week reads; values are JS/Postgres DOW. */
export const WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
] as const

export interface MultiplierForm {
  label: string
  /** Text of the number box, e.g. "2" or "1.5". */
  factor: string
  /** Selected weekdays. EMPTY means every day (stored as null). */
  days: number[]
  /** '' = no start. */
  startDate: string
  /** '' = no end. */
  endDate: string
}

export const EMPTY_MULTIPLIER_FORM: MultiplierForm = {
  label: '',
  factor: '2',
  days: [],
  startDate: '',
  endDate: '',
}

export function multiplierToForm(multiplier: XpMultiplier): MultiplierForm {
  return {
    label: multiplier.label,
    factor: String(multiplier.factor),
    days: multiplier.daysOfWeek ? [...multiplier.daysOfWeek] : [],
    startDate: multiplier.startDate ?? '',
    endDate: multiplier.endDate ?? '',
  }
}

/** Mon..Sun order, so two rules picked in a different tap order store identically. */
function sortWeekdays(days: readonly number[]): number[] {
  const order = WEEKDAYS.map(d => d.value as number)
  return [...new Set(days)].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

export function parseMultiplierForm(form: MultiplierForm): Parsed<XpMultiplier> {
  const parsed = xpMultiplierSchema.safeParse({
    label: form.label,
    factor: toNumber(form.factor),
    // No chip selected means "every day". The schema rejects an empty array
    // (it would match no day at all in SQL), so it must be sent as null.
    daysOfWeek: form.days.length === 0 ? null : sortWeekdays(form.days),
    startDate: form.startDate || null,
    endDate: form.endDate || null,
  })
  if (!parsed.success) {
    return {
      ok: false,
      errors: fieldErrors(parsed.error, {
        factor: `Enter a multiplier from ${L.multiplierFactor.min} to ${L.multiplierFactor.max} (up to 2 decimals)`,
      }),
    }
  }
  return { ok: true, value: parsed.data }
}

/** Toggle one weekday chip. */
export function toggleWeekday(days: readonly number[], day: number): number[] {
  return days.includes(day) ? days.filter(d => d !== day) : sortWeekdays([...days, day])
}

/** "x2" / "x1.5" using the multiplication sign. */
export function formatFactor(factor: number): string {
  return `×${Number(factor.toFixed(2))}`
}

/** "Mon, Wed" / "Every day". */
export function describeDays(daysOfWeek: readonly number[] | null): string {
  if (!daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.length === 7) return 'Every day'
  return sortWeekdays(daysOfWeek)
    .map(day => WEEKDAYS.find(w => w.value === day)?.short ?? '')
    .filter(Boolean)
    .join(', ')
}

/** "20 Oct 2026 to 26 Oct 2026" / "From 20 Oct 2026" / "Until 26 Oct 2026" / "" (always on). */
export function describeWindow(startDate: string | null, endDate: string | null): string {
  if (startDate && endDate) {
    return startDate === endDate ? formatDay(startDate) : `${formatDay(startDate)} to ${formatDay(endDate)}`
  }
  if (startDate) return `From ${formatDay(startDate)}`
  if (endDate) return `Until ${formatDay(endDate)}`
  return ''
}

/** One line under a rule's name in the list: "x2 · Mon · From 20 Oct 2026". */
export function describeMultiplier(multiplier: XpMultiplier): string {
  return [
    formatFactor(multiplier.factor),
    describeDays(multiplier.daysOfWeek),
    describeWindow(multiplier.startDate, multiplier.endDate),
  ]
    .filter(Boolean)
    .join(' · ')
}

// ─── Badge rules ─────────────────────────────────────────────────────────────

export interface EditableBadge {
  code: string
  name: string
  category: AchievementCategory
  /** The built-in requirement from the achievement definition. */
  defaultThreshold: number
  min: number
  max: number
  /** What the number counts, e.g. "check-ins", "day streak", "XP". */
  unit: string
}

/**
 * Tighter ceilings where the general 1..10000 bound would let an owner save a
 * badge nobody can ever earn: a rolling 7-day window holds at most 7 attended
 * days, a rolling 30-day window at most 30.
 */
const BADGE_MAX: Record<string, number> = {
  'att-week-warrior': BOARD_WINDOW_DAYS.week,
  'att-month-hustler': BOARD_WINDOW_DAYS.month,
}

const BADGE_UNIT: Record<string, string> = {
  'att-week-warrior': 'check-ins in 7 days',
  'att-month-hustler': 'check-ins in 30 days',
  'mem-one-year': 'days of membership',
  'spc-early-bird': 'morning check-ins',
  'spc-unbreakable': 'day streak',
}

const CATEGORY_UNIT: Record<AchievementCategory, string> = {
  attendance: 'check-ins',
  streak: 'day streak',
  workout: 'workouts',
  membership: 'renewals',
  xp: 'XP',
  special: '',
}

export const BADGE_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  attendance: 'Attendance',
  streak: 'Streaks',
  workout: 'Workouts',
  membership: 'Membership',
  xp: 'XP',
  special: 'Special',
}

/**
 * The achievements an owner may re-tune.
 *
 * Left out on purpose:
 *  - `pendingBackend` ones: there is no data behind them yet, so a threshold
 *    would be a setting that does nothing.
 *  - requirement 0 or 1 ("Welcome Aboard", "First Check-in", "First Renewal"):
 *    they are yes/no events, and a "First Check-in" that needs 5 check-ins would
 *    contradict its own name.
 */
export const EDITABLE_BADGES: readonly EditableBadge[] = ACHIEVEMENT_DEFINITIONS
  .filter(def => !def.pendingBackend && Number.isInteger(def.requirement) && def.requirement > 1)
  .map(def => ({
    code: def.id,
    name: def.name,
    category: def.category,
    defaultThreshold: def.requirement,
    min: L.badgeThreshold.min,
    max: BADGE_MAX[def.id] ?? L.badgeThreshold.max,
    unit: BADGE_UNIT[def.id] ?? CATEGORY_UNIT[def.category],
  }))

const EDITABLE_BY_CODE = new Map(EDITABLE_BADGES.map(badge => [badge.code, badge]))

/** Text of each threshold box, keyed by achievement code. */
export type BadgeForm = Record<string, string>

/** Every editable badge gets a box showing its effective threshold. */
export function badgeRulesToForm(rules: Record<string, number>): BadgeForm {
  const form: BadgeForm = {}
  for (const badge of EDITABLE_BADGES) {
    form[badge.code] = String(rules[badge.code] ?? badge.defaultThreshold)
  }
  return form
}

/**
 * Boxes -> the overrides to store.
 *
 * Only values that DIFFER from the default are kept, so "Reset to default"
 * really removes the override: if a default changes in a later release, gyms
 * that never customised that badge follow it instead of being pinned to the old
 * number. An empty box also means "use the default".
 */
export function parseBadgeForm(form: BadgeForm): Parsed<Record<string, number>> {
  const errors: FieldErrors = {}
  const rules: Record<string, number> = {}

  for (const badge of EDITABLE_BADGES) {
    const raw = (form[badge.code] ?? '').trim()
    if (raw === '') continue
    const value = Number(raw)
    if (!Number.isInteger(value) || value < badge.min || value > badge.max) {
      errors[badge.code] = `Enter a whole number from ${badge.min} to ${badge.max}`
      continue
    }
    if (value !== badge.defaultThreshold) rules[badge.code] = value
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: rules }
}

/**
 * Server-side check of badge rules arriving from the browser. The generic
 * schema only knows "a code-shaped key and 1..10000"; this also rejects codes
 * that are not editable badges and values above a badge's own ceiling.
 * Returns an error message, or null when the rules are acceptable.
 */
export function badgeRulesProblem(rules: unknown): string | null {
  const parsed = badgeRulesSchema.safeParse(rules)
  if (!parsed.success) return 'One of the badge thresholds is not valid.'
  for (const [code, value] of Object.entries(parsed.data)) {
    const badge = EDITABLE_BY_CODE.get(code)
    if (!badge) return 'One of the badges cannot be customised.'
    if (value < badge.min || value > badge.max) {
      return `${badge.name} must be between ${badge.min} and ${badge.max}.`
    }
  }
  return null
}

/** Overrides that still point at an editable badge and differ from its default. */
export function countBadgeOverrides(rules: Record<string, number>): number {
  let count = 0
  for (const badge of EDITABLE_BADGES) {
    const value = rules[badge.code]
    if (typeof value === 'number' && value !== badge.defaultThreshold) count++
  }
  return count
}

// ─── Achievement config (weekly goal + prizes) ───────────────────────────────

export interface AchievementConfigForm {
  weeklyGoalDays: number
  weeklyPrize: string
  monthlyPrize: string
}

export type AchievementConfig = Pick<GamificationSettings, 'weeklyGoalDays' | 'weeklyPrize' | 'monthlyPrize'>

export function achievementConfigToForm(settings: AchievementConfig): AchievementConfigForm {
  return {
    weeklyGoalDays: settings.weeklyGoalDays,
    weeklyPrize: settings.weeklyPrize ?? '',
    monthlyPrize: settings.monthlyPrize ?? '',
  }
}

export function parseAchievementConfigForm(form: AchievementConfigForm): Parsed<AchievementConfig> {
  const prizeTooLong = `Keep the prize under ${L.prizeMax} characters`
  const parsed = gamificationSettingsPatchSchema.safeParse({
    weeklyGoalDays: form.weeklyGoalDays,
    weeklyPrize: form.weeklyPrize,
    monthlyPrize: form.monthlyPrize,
  })
  if (!parsed.success) {
    return {
      ok: false,
      errors: fieldErrors(parsed.error, {
        weeklyGoalDays: `Pick a goal from ${L.weeklyGoalDays.min} to ${L.weeklyGoalDays.max} days`,
        weeklyPrize: prizeTooLong,
        monthlyPrize: prizeTooLong,
      }),
    }
  }
  // The schema trims prize text and turns an empty one into null ("no prize").
  return { ok: true, value: parsed.data as AchievementConfig }
}

// ─── Card summaries ──────────────────────────────────────────────────────────

/** "10 XP per check-in · 50 per renewal · 2 bonus rules" */
export function summarizeXp(
  settings: Pick<GamificationSettings, 'xpPerCheckin' | 'xpPerRenewal' | 'xpMultipliers'>,
): string {
  const rules = settings.xpMultipliers.length
  return [
    `${settings.xpPerCheckin} XP per check-in`,
    `${settings.xpPerRenewal} per renewal`,
    rules === 0 ? 'no bonus rules' : plural(rules, 'bonus rule'),
  ].join(' · ')
}

/** "All 19 badges use the default thresholds" / "3 of 19 badges customised" */
export function summarizeBadgeRules(settings: Pick<GamificationSettings, 'badgeRules'>): string {
  const total = EDITABLE_BADGES.length
  const custom = countBadgeOverrides(settings.badgeRules)
  return custom === 0
    ? `All ${total} badges use the default thresholds`
    : `${custom} of ${total} badges customised`
}

/** "Weekly goal 4 days · weekly and monthly prizes set" */
export function summarizeAchievementConfig(settings: AchievementConfig): string {
  const prizes =
    settings.weeklyPrize && settings.monthlyPrize ? 'weekly and monthly prizes set'
    : settings.weeklyPrize ? 'weekly prize set'
    : settings.monthlyPrize ? 'monthly prize set'
    : 'no prizes set'
  return `Weekly goal ${plural(settings.weeklyGoalDays, 'day')} · ${prizes}`
}

// ─── Settings patch -> row ───────────────────────────────────────────────────

type SettingsRowColumns = Omit<GamificationSettingsRow, 'gym_id' | 'updated_at'>

const COLUMN_OF: Record<keyof GamificationSettings, keyof SettingsRowColumns> = {
  leaderboardsEnabled: 'leaderboards_enabled',
  xpPerCheckin: 'xp_per_checkin',
  xpPerRenewal: 'xp_per_renewal',
  xpPortalActivation: 'xp_portal_activation',
  weeklyGoalDays: 'weekly_goal_days',
  xpMultipliers: 'xp_multipliers',
  badgeRules: 'badge_rules',
  weeklyPrize: 'weekly_prize',
  monthlyPrize: 'monthly_prize',
}

/**
 * A validated patch -> ONLY the columns it names.
 *
 * The save is an upsert of just these columns: on conflict PostgREST updates
 * the columns present in the payload, and on first insert the database defaults
 * fill the rest. Sending the whole row instead would be a read-modify-write, so
 * two cards saved close together (or from two devices) could overwrite each
 * other's fields with stale values.
 */
export function patchToRow(patch: GamificationSettingsPatch): Partial<SettingsRowColumns> {
  const full = settingsToRow({ ...DEFAULT_GAMIFICATION_SETTINGS, ...definedOnly(patch) })
  const row: Partial<SettingsRowColumns> = {}
  for (const key of Object.keys(COLUMN_OF) as Array<keyof GamificationSettings>) {
    if (patch[key] === undefined) continue
    const column = COLUMN_OF[key]
    ;(row as Record<string, unknown>)[column] = full[column]
  }
  return row
}

function definedOnly<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] !== undefined) out[key] = value[key]
  }
  return out
}

// ─── Leaderboard preview ─────────────────────────────────────────────────────

/** Rows shown before "Show more". */
export const OWNER_BOARD_PREVIEW = 10

/**
 * Rows fetched per board. The preview loads all 50 up front and "Show more"
 * only reveals them, so expanding the list costs no extra request on 4G.
 */
export const OWNER_BOARD_LIMIT = 50

// ─── Prizes ──────────────────────────────────────────────────────────────────

/** The two boards that can carry a prize. Streak and all-time have no period to award. */
export const PRIZE_BOARDS = ['week', 'month'] as const
export type PrizeBoard = (typeof PRIZE_BOARDS)[number]

export function isPrizeBoard(value: unknown): value is PrizeBoard {
  return value === 'week' || value === 'month'
}

export function prizeFor(
  settings: Pick<GamificationSettings, 'weeklyPrize' | 'monthlyPrize'>,
  board: PrizeBoard,
): string | null {
  return (board === 'week' ? settings.weeklyPrize : settings.monthlyPrize) || null
}

const PERIOD_LABEL_RE = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/

/**
 * `gamification_awards.period_label` for a board right now: the board's rolling
 * window as 'YYYY-MM-DD..YYYY-MM-DD'.
 *
 * It is the same window the RPC ranks by (`rollingWindow`), so the label names
 * exactly the days the leader was leading for. It is stable within a day, which
 * is what makes a second tap hit the table's unique key instead of awarding
 * twice, and it moves on with the window the next day.
 */
export function awardPeriodLabel(board: PrizeBoard, now: Date | string | number = new Date()): string {
  const window = rollingWindow(BOARD_WINDOW_DAYS[board], now)
  return `${window.start}..${window.end}`
}

/** '2026-10-06..2026-10-12' -> "6 Oct to 12 Oct 2026". Anything else is shown as stored. */
export function formatPeriodLabel(label: string): string {
  const m = PERIOD_LABEL_RE.exec(label)
  if (!m || !isValidDateString(m[1]) || !isValidDateString(m[2])) return label
  const sameYear = m[1].slice(0, 4) === m[2].slice(0, 4)
  return `${formatDay(m[1], !sameYear)} to ${formatDay(m[2])}`
}

/**
 * `awarded_at` -> "12 Oct" (the IST day it was marked), or '' when the
 * timestamp is missing or unparseable. Guarded because `istDateOf` throws on an
 * invalid date, and one odd row must not take the whole tab down.
 */
export function awardDay(awardedAt: string): string {
  if (!awardedAt || Number.isNaN(Date.parse(awardedAt))) return ''
  return formatDay(istDateOf(awardedAt), false)
}

/** What the board's value means, for "5 check-ins" under a leader's name. */
export function formatBoardValue(board: PrizeBoard, value: number): string {
  return `${plural(value, 'check-in')} in the ${LEADERBOARD_BOARD_LABELS[board].toLowerCase()}`
}

/**
 * The members sharing first place on a board.
 *
 * The RPC ranks with RANK(), so a tie gives several rows rank 1 and each of
 * them is a leader. A member on 0 is not leading anything (an empty gym would
 * otherwise show everyone as "#1"). Capped so a large tie cannot flood the card.
 */
export function pickLeaders(rows: readonly LeaderboardRow[], max = 3): LeaderboardRow[] {
  return rows.filter(row => row.rank === 1 && row.value > 0 && row.memberId).slice(0, max)
}

export interface AwardLike {
  id: string
  memberId: string
  board: string
  periodLabel: string
  awardedAt: string
}

/** The award for this member, board and exact period, if one exists. */
export function findAward<T extends AwardLike>(
  awards: readonly T[],
  board: PrizeBoard,
  memberId: string,
  periodLabel: string,
): T | undefined {
  return awards.find(a => a.board === board && a.memberId === memberId && a.periodLabel === periodLabel)
}

/**
 * The same member's most recent award on this board for an EARLIER period that
 * still overlaps the current window.
 *
 * Because the windows roll daily, a prize handed over yesterday no longer
 * matches today's period label and the button would look untouched. This lets
 * the card say "Awarded on 11 Oct" so the owner does not hand out the same
 * prize twice for what is, to them, the same week.
 */
export function findOverlappingAward<T extends AwardLike>(
  awards: readonly T[],
  board: PrizeBoard,
  memberId: string,
  periodLabel: string,
): T | undefined {
  const current = PERIOD_LABEL_RE.exec(periodLabel)
  if (!current) return undefined
  return awards.find(a => {
    if (a.board !== board || a.memberId !== memberId || a.periodLabel === periodLabel) return false
    const past = PERIOD_LABEL_RE.exec(a.periodLabel)
    // Overlap: the earlier window ends on or after the day this one starts.
    return past !== null && past[2] >= current[1] && past[1] <= current[2]
  })
}

/** PostgREST row -> `GamificationAward`; null when the row is not usable. */
export function mapAward(raw: unknown): GamificationAward | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.member_id !== 'string') return null
  if (!isLeaderboardBoard(row.board)) return null

  // A to-one embed is an object, but supabase-js types (and older PostgREST
  // versions) can surface it as a one-element array.
  const member = Array.isArray(row.member) ? row.member[0] : row.member
  const name =
    typeof member === 'object' && member !== null && typeof (member as { name?: unknown }).name === 'string'
      ? (member as { name: string }).name
      : 'Member'

  return {
    id: row.id,
    memberId: row.member_id,
    memberName: name,
    board: row.board,
    periodLabel: typeof row.period_label === 'string' ? row.period_label : '',
    prize: typeof row.prize === 'string' ? row.prize : '',
    awardedAt: typeof row.awarded_at === 'string' ? row.awarded_at : '',
  }
}
