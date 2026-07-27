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
 */

import type { TemplateId } from '@/types/whatsapp'

export type HeaderKind = 'image'

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
}

export function getTemplateSpec(templateId: TemplateId): TemplateSpec | undefined {
  return TEMPLATE_SPECS[templateId]
}
