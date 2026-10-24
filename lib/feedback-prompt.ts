/**
 * When a gym owner is asked for feedback.
 *
 * The rule, in one place so the API and the tests agree on it:
 *   - never in the first 3 days after the gym was created, so a new owner can look around and
 *     try the features before being asked what they think;
 *   - only once onboarding is finished (never in the middle of setting up);
 *   - until the owner has sent feedback for the first time: at most once a day;
 *   - after that: at most once a month, with a "short review" wording.
 *
 * There is no end date: a monthly check-in continues for as long as the owner is on GymFlow.
 * Pure function of its inputs: the route supplies the facts from the database.
 */

export const FEEDBACK_PROMPT_FIRST_DELAY_DAYS = 3
export const FEEDBACK_PROMPT_DAILY_INTERVAL_DAYS = 1
export const FEEDBACK_PROMPT_MONTHLY_INTERVAL_DAYS = 30

const DAY_MS = 86_400_000
/**
 * An hour is taken off each interval. "Once a day" should mean the same time of day on the next
 * day; without the slack, an owner who opens the app a few minutes earlier than they did
 * yesterday would be skipped and not asked until the day after.
 */
const SLACK_MS = 3_600_000
const FIRST_DELAY_MS = FEEDBACK_PROMPT_FIRST_DELAY_DAYS * DAY_MS
const DAILY_MS = FEEDBACK_PROMPT_DAILY_INTERVAL_DAYS * DAY_MS - SLACK_MS
const MONTHLY_MS = FEEDBACK_PROMPT_MONTHLY_INTERVAL_DAYS * DAY_MS - SLACK_MS

export type FeedbackPromptReason =
  | 'show'
  | 'not_onboarded'
  | 'too_early'
  | 'too_soon'
  | 'unknown_gym'

/** 'first' = the owner has never sent feedback; 'monthly' = a periodic check-in after that. */
export type FeedbackPromptKind = 'first' | 'monthly'

export function shouldPromptForFeedback(input: {
  now: Date
  gymCreatedAt: string | null
  onboardingCompleted: boolean
  /** When the owner last sent feedback (from this pop-up or the Support menu), or null if never. */
  lastFeedbackAt: string | null
  /** When the pop-up was last shown, or null if never. */
  lastShownAt: string | null
}): { show: boolean; reason: FeedbackPromptReason; kind: FeedbackPromptKind } {
  const kind: FeedbackPromptKind = input.lastFeedbackAt ? 'monthly' : 'first'
  const no = (reason: FeedbackPromptReason) => ({ show: false, reason, kind })

  const created = input.gymCreatedAt ? Date.parse(input.gymCreatedAt) : NaN
  if (Number.isNaN(created)) return no('unknown_gym')
  if (!input.onboardingCompleted) return no('not_onboarded')

  const now = input.now.getTime()
  if (now - created < FIRST_DELAY_MS) return no('too_early')

  // The wait is counted from the later of "last shown" and "last feedback", so an owner who sent
  // feedback is not asked again a month after an older pop-up that preceded it.
  const stamps = [input.lastShownAt, input.lastFeedbackAt]
    .map(s => (s ? Date.parse(s) : NaN))
    .filter(n => !Number.isNaN(n))
  if (stamps.length > 0) {
    const reference = Math.max(...stamps)
    const wait = kind === 'monthly' ? MONTHLY_MS : DAILY_MS
    if (now - reference < wait) return no('too_soon')
  }

  return { show: true, reason: 'show', kind }
}
