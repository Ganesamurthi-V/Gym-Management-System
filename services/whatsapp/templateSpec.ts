/**
 * services/whatsapp/templateSpec.ts
 *
 * Declarative contract for every approved Meta template GymFlow sends.
 *
 * This is the single source of truth used by validateTemplatePayload() to
 * verify — BEFORE any WhatsApp API call — that the payload built in graph.ts
 * exactly matches the approved template: name, language, body variable order &
 * count, and header format.
 *
 * If a template ever changes in Meta Business Manager, update the matching entry
 * here and the validator + tests will keep the payload builder honest.
 *
 * Header formats:
 *   'image' — approved header is an IMAGE; the payload MUST send a header
 *             component whose first parameter is the GymFlow image. All six
 *             approved templates use an image header.
 *
 * The four gym_* gamification templates at the end are specified here before they
 * exist in Meta. Their text is in GAMIFICATION_TEMPLATE_COPY, and nothing sends them
 * until they are listed in ENABLED_GAMIFICATION_TEMPLATES (config/whatsapp.ts).
 */

import type { GamificationTemplateId, TemplateId } from '@/types/whatsapp'

export type HeaderKind = 'image'

export type ButtonKind = 'url'

export interface TemplateSpec {
  /** Exact approved template name (must equal the TemplateId). */
  name: TemplateId
  /** Approved language code. */
  language: string
  /** How the approved header is rendered (see module docs). */
  header: HeaderKind
  /**
   * Ordered list of body variable field names, {{1}}..{{n}}. Purely descriptive
   * labels used to build a clear validation error — the validator enforces the
   * COUNT and that each rendered value is a non-empty string.
   */
  body: string[]
  /**
   * If the approved template has a dynamic URL button, set to 'url'.
   * The validator will then enforce a button component with one text parameter.
   */
  button?: ButtonKind
}

/**
 * One entry per approved template. Body arrays are the positional {{1}}..{{n}}
 * order exactly as approved in Meta.
 */
export const TEMPLATE_SPECS: Record<TemplateId, TemplateSpec> = {
  _gymflow_welcome_member: {
    name: '_gymflow_welcome_member',
    language: 'en',
    header: 'image',
    body: ['gymName', 'memberName', 'membershipPlan', 'startDate', 'memberId'],
  },
  membership_renewed: {
    name: 'membership_renewed',
    language: 'en',
    header: 'image',
    body: ['memberName', 'gymName', 'membershipPlan', 'validUntil'],
  },
  membership_expiry_reminder: {
    name: 'membership_expiry_reminder',
    language: 'en',
    header: 'image',
    body: ['memberName', 'membershipPlan', 'expiryDate', 'daysRemaining'],
  },
  membership_expired: {
    name: 'membership_expired',
    language: 'en',
    header: 'image',
    body: ['memberName', 'gymName', 'expiredDate', 'memberId'],
  },
  payment_due_reminder: {
    name: 'payment_due_reminder',
    language: 'en',
    header: 'image',
    body: ['memberName', 'dueAmount'],
  },
  _birthday_wishes: {
    name: '_birthday_wishes',
    language: 'en',
    header: 'image',
    body: ['gymName', 'memberName'],
  },
  member_app_invitation: {
    name: 'member_app_invitation',
    language: 'en',
    header: 'image',
    body: ['gymName', 'memberName'],
    button: 'url',
  },

  // ── Gamification (NOT in Meta yet; see GAMIFICATION_TEMPLATE_COPY below) ──────
  gym_streak_at_risk: {
    name: 'gym_streak_at_risk',
    language: 'en',
    header: 'image',
    body: ['memberFirstName', 'streakDays', 'gymName'],
  },
  gym_weekly_goal_reached: {
    name: 'gym_weekly_goal_reached',
    language: 'en',
    header: 'image',
    body: ['memberFirstName', 'daysAttended', 'gymName'],
  },
  gym_leaderboard_rank_up: {
    name: 'gym_leaderboard_rank_up',
    language: 'en',
    header: 'image',
    body: ['memberFirstName', 'rank', 'boardName', 'gymName'],
  },
  gym_prize_awarded: {
    name: 'gym_prize_awarded',
    language: 'en',
    header: 'image',
    body: ['memberFirstName', 'prize', 'periodLabel', 'gymName'],
  },
}

// ─── Gamification templates: the copy to submit to Meta ───────────────────────

export const GAMIFICATION_TEMPLATE_IDS = [
  'gym_streak_at_risk',
  'gym_weekly_goal_reached',
  'gym_leaderboard_rank_up',
  'gym_prize_awarded',
] as const satisfies readonly GamificationTemplateId[]

export type TemplateCategory = 'UTILITY' | 'MARKETING'

export interface GamificationTemplateCopy {
  /** The category to pick when creating the template in WhatsApp Manager. */
  category: TemplateCategory
  /** The body exactly as it must be typed into WhatsApp Manager, placeholders included. */
  bodyText: string
  /** One sample value per placeholder, in order ({{1}} first). Meta asks for these on submission. */
  examples: string[]
}

/**
 * The existing templates were written directly in WhatsApp Manager, so their text is not in
 * this repo. These four are written here FIRST and created in Meta by hand afterwards, so
 * the wording lives next to the variable contract above.
 *
 * lib/whatsapp/GAMIFICATION_TEMPLATES.md is the copy-paste sheet for that hand step. It must
 * say exactly what is here; __tests__/whatsapp/gamificationTemplatesDoc.test.ts fails if the
 * two drift. Change the wording here, then the sheet, then (if already approved) in Meta.
 *
 * Wording rules: the body must not start or end with a placeholder and two placeholders must not
 * touch. Paragraph breaks are fine in the body, but never inside a placeholder's value (Meta
 * rejects those).
 */
export const GAMIFICATION_TEMPLATE_COPY: Record<GamificationTemplateId, GamificationTemplateCopy> = {
  gym_streak_at_risk: {
    category: 'MARKETING',
    bodyText:
      'Hi *{{1}}*! 💪 Amazing consistency! You\'ve checked in for *{{2}}* consecutive days at *{{3}}*.\n\n🔥 Keep your streak alive! Head to the gym today and check in to maintain your streak. Don\'t let your hard-earned progress break — stay consistent and keep pushing towards your fitness goals! 🚀',
    examples: ['Arjun', '5', 'Iron Temple'],
  },
  gym_weekly_goal_reached: {
    category: 'MARKETING',
    bodyText:
      '🎉 Well done, {{1}}! You\'ve attended the gym {{2}} days 🔥 in the last 7 days and achieved your weekly goal at {{3}}!\n\n🔥 Keep up the great work! Stay consistent, keep pushing your limits, and make every workout count. See you at the gym! 🏋️',
    examples: ['Arjun', '4', 'Iron Temple'],
  },
  gym_leaderboard_rank_up: {
    category: 'MARKETING',
    bodyText:
      '🏆 Congratulations, *{{1}}*! You\'re ranked #*{{2}}* on the *{{3}}* leaderboard at *{{4}}!*\n\n🔥 Keep showing up, stay consistent, and keep checking in to defend your spot. Can you climb even higher? 🚀',
    examples: ['Arjun', '1', 'last 7 days', 'Iron Temple'],
  },
  gym_prize_awarded: {
    category: 'MARKETING',
    bodyText:
      '🎉 Congratulations, *{{1}}*! You\'ve won a prize — *{{2}}*!\n\n🏆 This reward is for your achievements during *{{3}}* at *{{4}}*.\n\n💪 Keep up the great work! Visit your gym and contact the staff to collect your well-deserved prize. 🎁',
    examples: ['Arjun', 'Free protein shaker', 'Last 7 days', 'Iron Temple'],
  },
}

export function isGamificationTemplate(templateId: string): templateId is GamificationTemplateId {
  return (GAMIFICATION_TEMPLATE_IDS as readonly string[]).includes(templateId)
}

export function getTemplateSpec(templateId: TemplateId): TemplateSpec | undefined {
  return TEMPLATE_SPECS[templateId]
}
