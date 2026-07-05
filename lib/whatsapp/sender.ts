/**
 * WhatsApp Cloud API — Template Message Sender
 *
 * Sends official Meta-approved template messages via the WhatsApp Cloud API.
 * All calls go server-side only — the access token is never exposed to the client.
 *
 * Template variable mappings (as registered in Meta Business Manager):
 *
 *  gymflow_welcome_member
 *    {{1}} gymName  {{2}} memberName  {{3}} plan  {{4}} startDate
 *
 *  membership_renewed
 *    {{1}} memberName  {{2}} gymName  {{3}} plan  {{4}} validUntil
 *
 *  membership_expiry_reminder
 *    {{1}} memberName  {{2}} plan  {{3}} expiryDate  {{4}} daysRemaining
 *
 *  membership_expired
 *    {{1}} memberName  {{2}} gymName  {{3}} plan  {{4}} expiryDate
 *
 *  payment_due_reminder
 *    {{1}} memberName  {{2}} dueAmount
 *
 *  birthday_wishes
 *    header {{1}} memberName   body {{1}} gymName
 */

import { getWhatsAppMessagesUrl, getWhatsAppAuthHeader } from '@/config/whatsapp'
import { formatDate, formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateId =
  | 'gymflow_welcome_member'
  | 'membership_renewed'
  | 'membership_expiry_reminder'
  | 'membership_expired'
  | 'payment_due_reminder'
  | 'birthday_wishes'

export interface TemplateContext {
  phone: string           // recipient E.164 or 10-digit
  gymName: string
  memberName: string
  plan?: string           // e.g. "monthly"
  startDate?: string      // ISO date
  validUntil?: string     // ISO date
  expiryDate?: string     // ISO date
  daysRemaining?: number
  dueAmount?: number      // in rupees
}

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('91') ? digits : `91${digits}`
}

// ─── Plan label ───────────────────────────────────────────────────────────────

function planLabel(plan?: string): string {
  if (!plan) return 'Membership'
  const map: Record<string, string> = {
    monthly:   'Monthly',
    quarterly: 'Quarterly (3 Months)',
    annual:    'Annual (12 Months)',
  }
  return map[plan.toLowerCase()] ?? plan.charAt(0).toUpperCase() + plan.slice(1)
}

// ─── Payload builders ─────────────────────────────────────────────────────────

function buildPayload(templateId: TemplateId, ctx: TemplateContext): object {
  const to = normalisePhone(ctx.phone)

  // Helper — builds a standard text component parameter
  const txt = (text: string) => ({ type: 'text', text })

  switch (templateId) {
    // gymflow_welcome_member
    // {{1}} gymName  {{2}} memberName  {{3}} plan  {{4}} startDate
    case 'gymflow_welcome_member':
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'gymflow_welcome_member',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                txt(ctx.gymName),
                txt(ctx.memberName),
                txt(planLabel(ctx.plan)),
                txt(ctx.startDate ? formatDate(ctx.startDate) : '—'),
              ],
            },
          ],
        },
      }

    // membership_renewed
    // {{1}} memberName  {{2}} gymName  {{3}} plan  {{4}} validUntil
    case 'membership_renewed':
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'membership_renewed',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                txt(ctx.memberName),
                txt(ctx.gymName),
                txt(planLabel(ctx.plan)),
                txt(ctx.validUntil ? formatDate(ctx.validUntil) : '—'),
              ],
            },
          ],
        },
      }

    // membership_expiry_reminder
    // {{1}} memberName  {{2}} plan  {{3}} expiryDate  {{4}} daysRemaining
    case 'membership_expiry_reminder':
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'membership_expiry_reminder',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                txt(ctx.memberName),
                txt(planLabel(ctx.plan)),
                txt(ctx.expiryDate ? formatDate(ctx.expiryDate) : '—'),
                txt(String(ctx.daysRemaining ?? 0)),
              ],
            },
          ],
        },
      }

    // membership_expired
    // {{1}} memberName  {{2}} gymName  {{3}} plan  {{4}} expiryDate
    case 'membership_expired':
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'membership_expired',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                txt(ctx.memberName),
                txt(ctx.gymName),
                txt(planLabel(ctx.plan)),
                txt(ctx.expiryDate ? formatDate(ctx.expiryDate) : '—'),
              ],
            },
          ],
        },
      }

    // payment_due_reminder
    // {{1}} memberName  {{2}} dueAmount
    case 'payment_due_reminder':
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'payment_due_reminder',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                txt(ctx.memberName),
                txt(formatCurrency(ctx.dueAmount ?? 0)),
              ],
            },
          ],
        },
      }

    // birthday_wishes
    // header {{1}} memberName   body {{1}} gymName
    case 'birthday_wishes':
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'birthday_wishes',
          language: { code: 'en' },
          components: [
            {
              type: 'header',
              parameters: [txt(ctx.memberName)],
            },
            {
              type: 'body',
              parameters: [txt(ctx.gymName)],
            },
          ],
        },
      }

    default:
      throw new Error(`Unknown template: ${templateId}`)
  }
}

// ─── Core sender ──────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp template message via the Meta Cloud API.
 * Must be called server-side — uses WHATSAPP_ACCESS_TOKEN from env.
 */
export async function sendWhatsAppTemplate(
  templateId: TemplateId,
  ctx: TemplateContext,
): Promise<SendResult> {
  // Guard: skip if phone is invalid
  const digits = ctx.phone.replace(/\D/g, '')
  if (digits.length < 10) {
    return { success: false, error: 'Invalid phone number' }
  }

  let url: string
  let headers: Record<string, string>

  try {
    url     = getWhatsAppMessagesUrl()
    headers = { 'Content-Type': 'application/json', ...getWhatsAppAuthHeader() }
  } catch (err) {
    return { success: false, error: 'WhatsApp not configured' }
  }

  const payload = buildPayload(templateId, ctx)

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(10_000),
    })

    const data = await res.json() as {
      messages?: { id: string }[]
      error?: { message: string; code: number }
    }

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`
      console.error(`[WhatsApp] Send failed (${templateId}):`, msg)
      return { success: false, error: msg }
    }

    const messageId = data.messages?.[0]?.id
    return { success: true, messageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[WhatsApp] Network error (${templateId}):`, msg)
    return { success: false, error: msg }
  }
}
