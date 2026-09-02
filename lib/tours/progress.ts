/**
 * lib/tours/progress.ts
 * ─────────────────────
 * The serialisable contract for guided-tour progress, shared by the browser hook
 * and the `/api/tours` route handler.
 *
 * Kept in its own module — deliberately free of any `driver.js` import, even a
 * type-only one — so the API route can validate and persist progress without
 * pulling the tour library or the step copy into the server bundle.
 *
 * STORAGE
 * -------
 * Progress nests under the `tour` key of the existing `gyms.onboarding_data`
 * JSONB column (see `lib/dal.ts`), so this feature needs no schema change, no
 * migration and no new table.
 *
 * WHY THE DATABASE AND NOT `localStorage`
 * --------------------------------------
 * An owner who finishes setup on a laptop and then opens the app on their phone
 * should not be shown the tour a second time. Progress is a property of the gym
 * account, not of a device.
 */

/**
 * Bump when the tour gains or loses chapters. A gym that completed version N is
 * not re-prompted, but the recorded version makes it possible to decide later
 * whether an existing completion should still count.
 */
export const TOUR_VERSION = 1

/** Ordered chapter ids. `lib/tours/definitions.ts` must cover exactly these. */
export const TOUR_CHAPTER_IDS = [
  'welcome',
  'dashboard',
  'members',
  'payments',
  'dues',
  'attendance',
  'inventory',
  'programs',
  'member-app',
  'wrap-up',
] as const

export type TourChapterId = (typeof TOUR_CHAPTER_IDS)[number]

export type TourStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed'

const TOUR_STATUSES: readonly TourStatus[] = [
  'not_started',
  'in_progress',
  'completed',
  'dismissed',
]

/** Defensive ceiling for the persisted step index. */
export const MAX_TOUR_STEP_INDEX = 199

export type TourProgress = {
  version: number
  status: TourStatus
  /** Chapter to resume in, or `null` when the tour has not started. */
  chapterId: TourChapterId | null
  /** Index WITHIN the chapter, so editing one chapter cannot shift another. */
  stepIndex: number
  startedAt: string | null
  updatedAt: string | null
}

export const EMPTY_TOUR_PROGRESS: TourProgress = {
  version: TOUR_VERSION,
  status: 'not_started',
  chapterId: null,
  stepIndex: 0,
  startedAt: null,
  updatedAt: null,
}

export function isTourChapterId(value: unknown): value is TourChapterId {
  return typeof value === 'string' && (TOUR_CHAPTER_IDS as readonly string[]).includes(value)
}

export function isTourStatus(value: unknown): value is TourStatus {
  return typeof value === 'string' && (TOUR_STATUSES as readonly string[]).includes(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accept only a bounded ISO-8601 timestamp string. */
function sanitizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return null
  return Number.isNaN(Date.parse(value)) ? null : value
}

function sanitizeStepIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0
  if (value < 0) return 0
  return Math.min(value, MAX_TOUR_STEP_INDEX)
}

/**
 * Coerce an untrusted value — a JSONB blob from the database, or a request body
 * from the browser — into a well-formed `TourProgress`.
 *
 * Never throws: unknown or malformed fields fall back to their empty value so a
 * hand-edited `onboarding_data` row cannot break the dashboard.
 */
export function sanitizeTourProgress(raw: unknown): TourProgress {
  if (!isPlainObject(raw)) return { ...EMPTY_TOUR_PROGRESS }

  const status = isTourStatus(raw.status) ? raw.status : 'not_started'
  const chapterId = isTourChapterId(raw.chapterId) ? raw.chapterId : null
  const version =
    typeof raw.version === 'number' && Number.isInteger(raw.version) && raw.version >= 0
      ? Math.min(raw.version, 1_000)
      : TOUR_VERSION

  return {
    version,
    status,
    chapterId,
    stepIndex: sanitizeStepIndex(raw.stepIndex),
    startedAt: sanitizeTimestamp(raw.startedAt),
    updatedAt: sanitizeTimestamp(raw.updatedAt),
  }
}

/** Read the `tour` key out of a whole `onboarding_data` blob. */
export function readTourProgress(onboardingData: unknown): TourProgress {
  if (!isPlainObject(onboardingData)) return { ...EMPTY_TOUR_PROGRESS }
  return sanitizeTourProgress(onboardingData.tour)
}

/**
 * Should the tour start by itself for this gym?
 *
 * Only for an owner who has never seen it. Someone who finished it, or closed it
 * on purpose, is never auto-prompted again — they replay it from the account
 * menu instead.
 */
export function shouldAutoStartTour(progress: TourProgress): boolean {
  return progress.status === 'not_started'
}

/** Is there a partially finished tour worth resuming? */
export function shouldResumeTour(progress: TourProgress): boolean {
  return progress.status === 'in_progress' && progress.chapterId !== null
}
