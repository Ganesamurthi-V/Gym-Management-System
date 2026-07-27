/**
 * services/whatsapp/graph.ts
 *
 * High-level WhatsApp Cloud API service layer.
 *
 * ALL outbound API calls go through the GymFlow reverse proxy:
 *   https://graph.gymflow.sbs/api/graph
 * which forwards them transparently to graph.facebook.com.
 *
 * Exposes:
 *   sendMessage()     — send any message type
 *   sendTemplate()    — send an approved template
 *   uploadMedia()     — upload a media file
 *   downloadMedia()   — get the download URL for a media ID
 *   deleteMedia()     — delete a media object
 *   getPhoneNumber()  — fetch phone number metadata
 *   markMessageRead() — send a read receipt
 *
 * All methods use lib/fetch.ts for timeout + retry + backoff.
 */

import { fetchJson }              from '@/lib/fetch'
import { logger }                 from '@/lib/logger'
import { formatDate } from '@/lib/utils'
import { validateTemplatePayload, formatValidationError } from './validateTemplate'
import type {
  SendResult,
  TemplateId,
  TemplateContext,
  UploadMediaOptions,
  UploadMediaResult,
  MediaInfo,
  PhoneNumberInfo,
} from '@/types/whatsapp'
import { WhatsAppConfigError, WhatsAppUpstreamError } from '@/types/whatsapp'

// ─── Config helpers ───────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const base    = process.env.WHATSAPP_BASE_URL?.replace(/\/$/, '')
  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
  if (!base) throw new WhatsAppConfigError('WHATSAPP_BASE_URL is not set')
  return `${base}/${version}`
}

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!id) throw new WhatsAppConfigError('WHATSAPP_PHONE_NUMBER_ID is not set')
  return id
}

function getAuthHeader(): Record<string, string> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new WhatsAppConfigError('WHATSAPP_ACCESS_TOKEN is not set')
  return {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // The Indian subscriber number is the last 10 digits; always render as
  // country-code + those 10 digits. Guarding on startsWith('91') was a bug:
  // a valid 10-digit mobile that itself starts with "91" (e.g. 9198765432)
  // would be left WITHOUT a country code and fail to route on WhatsApp.
  // This form is also idempotent for numbers already stored as 91XXXXXXXXXX.
  if (digits.length >= 10) return `91${digits.slice(-10)}`
  return digits
}

function planLabel(plan?: string): string {
  if (!plan) return 'Membership'
  const map: Record<string, string> = {
    monthly:   'Monthly',
    quarterly: 'Quarterly (3 Months)',
    annual:    'Annual (12 Months)',
  }
  return map[plan.toLowerCase()] ?? plan.charAt(0).toUpperCase() + plan.slice(1)
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

/**
 * Send any WhatsApp message type (text, template, interactive, etc.)
 * Caller supplies the full messages-API body.
 *
 * @param body - Full request body per Meta messages API spec
 */
export async function sendMessage(body: Record<string, unknown>): Promise<SendResult> {
  const url = `${getBaseUrl()}/${getPhoneNumberId()}/messages`

  try {
    const { data, status } = await fetchJson<{
      messages?: { id: string }[]
      error?: { message: string; code: number }
    }>(url, {
      method:  'POST',
      headers: getAuthHeader(),
      body:    JSON.stringify(body),
      label:   'sendMessage',
    })

    if (status >= 400 || data.error) {
      const msg = data.error?.message ?? `HTTP ${status}`
      logger.warn('sendMessage failed', { status, code: data.error?.code })
      return { success: false, error: msg, httpStatus: status }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('sendMessage error', err)
    return { success: false, error: msg }
  }
}

// ─── sendTemplate ─────────────────────────────────────────────────────────────

/**
 * Build and send an approved Meta template message.
 *
 * The built payload is validated against the approved template contract
 * (templateSpec.ts) BEFORE any API call. If validation fails — wrong variable
 * count/order, an empty variable, a missing header image, etc. — the WhatsApp
 * API is NOT called and a clear validation error is returned.
 */
export async function sendTemplate(
  templateId: TemplateId,
  ctx: TemplateContext,
): Promise<SendResult> {
  const digits = ctx.phone.replace(/\D/g, '')
  if (digits.length < 10) {
    return { success: false, error: 'Invalid phone number' }
  }

  const body = buildTemplatePayload(templateId, ctx)

  // Log the final payload before sending (recipient masked — never log full PII).
  logger.info('sendTemplate payload built', {
    templateId,
    payload: { ...body, to: maskRecipient((body as { to?: string }).to) },
  })

  // Gate: refuse to dispatch anything that does not exactly match the approved
  // template contract.
  const validation = validateTemplatePayload(templateId, body)
  if (!validation.valid) {
    const error = formatValidationError(templateId, validation)
    logger.warn('sendTemplate blocked by validation', { templateId, errors: validation.errors })
    return { success: false, error }
  }

  return sendMessage(body)
}

/** Mask all but the last 4 digits of the recipient for safe logging. */
function maskRecipient(to?: string): string {
  if (!to) return ''
  return to.length <= 4 ? '****' : `${'*'.repeat(to.length - 4)}${to.slice(-4)}`
}

// ─── uploadMedia ──────────────────────────────────────────────────────────────

/**
 * Upload a media file and return its WhatsApp media ID.
 */
export async function uploadMedia(opts: UploadMediaOptions): Promise<UploadMediaResult> {
  const url = `${getBaseUrl()}/${getPhoneNumberId()}/media`

  const formData = new FormData()
  const blob     = new Blob([opts.buffer as any], { type: opts.mimeType })
  formData.append('file', blob, opts.filename)
  formData.append('type', opts.mimeType)
  formData.append('messaging_product', 'whatsapp')

  // Don't set Content-Type — browser/Node sets it with boundary automatically
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new WhatsAppConfigError('WHATSAPP_ACCESS_TOKEN is not set')

  try {
    const { data } = await fetchJson<{ id?: string; error?: { message: string } }>(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    formData as unknown as BodyInit,
      label:   'uploadMedia',
    })

    if (!data.id || data.error) {
      return { success: false, error: data.error?.message ?? 'Upload failed' }
    }

    return { success: true, mediaId: data.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('uploadMedia error', err)
    return { success: false, error: msg }
  }
}

// ─── downloadMedia ────────────────────────────────────────────────────────────

/**
 * Retrieve the temporary download URL for a WhatsApp media object.
 */
export async function downloadMedia(mediaId: string): Promise<MediaInfo> {
  const url = `${getBaseUrl()}/${mediaId}`

  const { data } = await fetchJson<MediaInfo>(url, {
    method:  'GET',
    headers: getAuthHeader(),
    label:   'downloadMedia',
  })

  return data
}

// ─── deleteMedia ──────────────────────────────────────────────────────────────

/**
 * Delete a media object from WhatsApp servers.
 */
export async function deleteMedia(mediaId: string): Promise<boolean> {
  const url = `${getBaseUrl()}/${mediaId}`

  const { data } = await fetchJson<{ success?: boolean; error?: { message: string } }>(url, {
    method:  'DELETE',
    headers: getAuthHeader(),
    label:   'deleteMedia',
  })

  return data.success === true
}

// ─── getPhoneNumber ───────────────────────────────────────────────────────────

/**
 * Fetch metadata for the configured WhatsApp business phone number.
 */
export async function getPhoneNumber(): Promise<PhoneNumberInfo> {
  const url = `${getBaseUrl()}/${getPhoneNumberId()}`

  const { data } = await fetchJson<PhoneNumberInfo>(url, {
    method:  'GET',
    headers: getAuthHeader(),
    label:   'getPhoneNumber',
  })

  return data
}

// ─── markMessageRead ─────────────────────────────────────────────────────────

/**
 * Send a read receipt for an inbound message.
 */
export async function markMessageRead(messageId: string): Promise<boolean> {
  const body = {
    messaging_product: 'whatsapp',
    status:            'read',
    message_id:        messageId,
  }

  const result = await sendMessage(body)
  return result.success
}

// ─── Template payload builder ─────────────────────────────────────────────────

/**
 * The image-header component shared by EVERY approved template.
 *
 * All six templates must use the identical GymFlow logo as their header image —
 * centralising it here makes that a structural guarantee (change the asset once
 * and every template updates together, so they can never drift apart).
 */
function headerImageComponent(): Record<string, unknown> {
  const link = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.gymflow.sbs') + '/logo_landspace.png'
  return {
    type: 'header',
    parameters: [{ type: 'image', image: { link } }],
  }
}

export function buildTemplatePayload(templateId: TemplateId, ctx: TemplateContext): Record<string, unknown> {
  const to  = normalisePhone(ctx.phone)
  const txt = (text: string) => ({ type: 'text', text })

  const base = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
  }

  const templates: Record<TemplateId, Record<string, unknown>> = {
    _gymflow_welcome_member: {
      ...base,
      template: {
        name: '_gymflow_welcome_member',
        language: { code: 'en' },
        // Approved template has a dynamic IMAGE HEADER that must be supplied as a
        // header parameter (omitting it → Meta error 132012).
        // Body positional order is [gym, member, plan, startDate, memberId] → {{1}}..{{5}}.
        components: [
          headerImageComponent(),
          {
            type: 'body',
            parameters: [
              txt(ctx.gymName),
              txt(ctx.memberName),
              txt(planLabel(ctx.plan)),
              txt(ctx.startDate ? formatDate(ctx.startDate) : '—'),
              txt(ctx.memberId ?? '—'),
            ],
          },
        ],
      },
    },
    membership_renewed: {
      ...base,
      template: {
        name: 'membership_renewed',
        language: { code: 'en' },
        components: [
          headerImageComponent(),
          {
            type: 'body',
            parameters: [
              txt(ctx.memberName),
              txt(ctx.gymName),
              txt(planLabel(ctx.plan)),
              txt(ctx.validUntil ? formatDate(ctx.validUntil) : '—'),
            ],
          }
        ],
      },
    },
    membership_expiry_reminder: {
      ...base,
      template: {
        name: 'membership_expiry_reminder',
        language: { code: 'en' },
        components: [
          headerImageComponent(),
          {
            type: 'body',
            parameters: [
              txt(ctx.memberName),
              txt(planLabel(ctx.plan)),
              txt(ctx.expiryDate ? formatDate(ctx.expiryDate) : '—'),
              txt(String(ctx.daysRemaining ?? 0)),
            ],
          }
        ],
      },
    },
    membership_expired: {
      ...base,
      template: {
        name: 'membership_expired',
        language: { code: 'en' },
        components: [
          headerImageComponent(),
          {
            type: 'body',
            parameters: [
              txt(ctx.memberName),
              txt(ctx.gymName),
              txt(ctx.expiryDate ? formatDate(ctx.expiryDate) : '—'),
              txt(ctx.memberId ?? '—'),
            ],
          }
        ],
      },
    },
    payment_due_reminder: {
      ...base,
      template: {
        name: 'payment_due_reminder',
        language: { code: 'en' },
        // Approved body already prints the ₹ symbol ("Amount : ₹{{2}}"), so the
        // parameter must be the bare grouped number — NOT formatCurrency(), which
        // would render "₹₹2,000".
        components: [
          headerImageComponent(),
          {
            type: 'body',
            parameters: [
              txt(ctx.memberName),
              txt(new Intl.NumberFormat('en-IN').format(ctx.dueAmount ?? 0)),
            ],
          }
        ],
      },
    },
    _birthday_wishes: {
      ...base,
      template: {
        name: '_birthday_wishes',
        language: { code: 'en' },
        components: [
          headerImageComponent(),
          {
            type: 'body',
            // Approved body order is [gymName, memberName] → {{1}}, {{2}}.
            parameters: [
              txt(ctx.gymName),
              txt(ctx.memberName)
            ],
          }
        ],
      },
    },
  }

  const payload = templates[templateId]
  if (!payload) throw new WhatsAppConfigError(`Unknown template: ${templateId}`)
  return payload
}
