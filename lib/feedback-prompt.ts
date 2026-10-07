/**
 * When a new gym owner is asked for feedback.
 *
 * The rule, in one place so the API and the tests agree on it:
 *   - only during the first 30 days after the gym was created;
 *   - only once onboarding is finished (never in the middle of setting up);
 *   - at most once every 3 days;
 *   - never again once the owner has sent feedback.
 *
 * Pure function of its inputs: the route supplies the facts from the database.
 */

export const FEEDBACK_PROMPT_WINDOW_DAYS = 30
export const FEEDBACK_PROMPT_INTERVAL_DAYS = 3

const DAY_MS = 86_400_000
/**
 * An hour is taken off the interval. "Every 3 days" should mean the same time of day on the
 * third day; without the slack, an owner who opens the app a few minutes earlier than they did
 * three days ago would be skipped and not asked until day 4.
 */
const INTERVAL_MS = FEEDBACK_PROMPT_INTERVAL_DAYS * DAY_MS - 3_600_000
const WINDOW_MS = FEEDBACK_PROMPT_WINDOW_DAYS * DAY_MS

export type FeedbackPromptReason =
  | 'show'
  | 'has_feedback'
  | 'not_onboarded'
  | 'window_over'
  | 'too_soon'
  | 'unknown_gym'

export function shouldPromptForFeedback(input: {
  now: Date
  gymCreatedAt: string | null
  onboardingCompleted: boolean
  /** The owner has already sent feedback (from this pop-up or from the Support menu). */
  hasFeedback: boolean
  /** When the pop-up was last shown, or null if never. */
  lastShownAt: string | null
}): { show: boolean; reason: FeedbackPromptReason } {
  const no = (reason: FeedbackPromptReason) => ({ show: false, reason })

  if (input.hasFeedback) return no('has_feedback')

  const created = input.gymCreatedAt ? Date.parse(input.gymCreatedAt) : NaN
  if (Number.isNaN(created)) return no('unknown_gym')
  if (!input.onboardingCompleted) return no('not_onboarded')
  if (input.now.getTime() - created >= WINDOW_MS) return no('window_over')

  if (input.lastShownAt) {
    const last = Date.parse(input.lastShownAt)
    if (!Number.isNaN(last) && input.now.getTime() - last < INTERVAL_MS) return no('too_soon')
  }

  return { show: true, reason: 'show' }
}
