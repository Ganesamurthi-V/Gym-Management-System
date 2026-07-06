/**
 * WhatsApp Cloud API Configuration
 *
 * All outbound WhatsApp API calls route through the GymFlow transparent proxy:
 *   https://graph.gymflow.sbs/api/graph  →  https://graph.facebook.com
 *
 * The proxy URL is controlled by WHATSAPP_BASE_URL (in .env.local / Vercel).
 * The upstream destination is controlled by GRAPH_API_BASE_URL (read by the proxy route).
 *
 * Neither value needs to be changed for normal operation.
 */

import { z } from 'zod'

// ─── Environment schema ───────────────────────────────────────────────────────

const whatsappEnvSchema = z.object({
  // Webhook verification + signature
  WHATSAPP_VERIFY_TOKEN: z.string().min(32, 'Verify token must be at least 32 characters'),
  WHATSAPP_APP_SECRET:   z.string().min(32, 'App secret must be at least 32 characters'),

  // WhatsApp Business Platform credentials
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, 'Phone number ID is required'),
  WHATSAPP_ACCESS_TOKEN:    z.string().min(1, 'Access token is required'),

  // API routing
  // WHATSAPP_BASE_URL  — base URL for outbound API calls (via proxy)
  // WHATSAPP_API_VERSION — Meta Graph API version (e.g. v21.0)
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_BASE_URL: z
    .string()
    .url()
    .default('https://graph.gymflow.sbs/api/graph'),
})

export type WhatsAppEnv = z.infer<typeof whatsappEnvSchema>

// ─── Config loading (singleton + cached) ─────────────────────────────────────

let _config: WhatsAppEnv | null = null
let _error:  Error | null       = null

export function getWhatsAppConfig(): WhatsAppEnv {
  if (_config) return _config
  if (_error)  throw _error

  try {
    const validated = whatsappEnvSchema.parse({
      WHATSAPP_VERIFY_TOKEN:    process.env.WHATSAPP_VERIFY_TOKEN,
      WHATSAPP_APP_SECRET:      process.env.WHATSAPP_APP_SECRET,
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_ACCESS_TOKEN:    process.env.WHATSAPP_ACCESS_TOKEN,
      WHATSAPP_API_VERSION:     process.env.WHATSAPP_API_VERSION,
      WHATSAPP_BASE_URL:        process.env.WHATSAPP_BASE_URL,
    })
    _config = validated
    return _config
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msg = `WhatsApp configuration validation failed:\n${err.issues
        .map(i => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`
      _error = new Error(msg)
      throw _error
    }
    _error = err as Error
    throw _error
  }
}

export function isWhatsAppConfigured(): boolean {
  try { getWhatsAppConfig(); return true } catch { return false }
}

export function validateWhatsAppConfig(): void {
  try {
    const cfg = getWhatsAppConfig()
    console.log('✅ WhatsApp configuration validated')
    console.log(`   Base URL:        ${cfg.WHATSAPP_BASE_URL}`)
    console.log(`   Phone Number ID: ${cfg.WHATSAPP_PHONE_NUMBER_ID}`)
    console.log(`   API Version:     ${cfg.WHATSAPP_API_VERSION}`)
  } catch (err) {
    console.error('❌ WhatsApp configuration validation failed')
    console.error(err instanceof Error ? err.message : String(err))
    if (process.env.NODE_ENV === 'production') throw err
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

/** https://graph.gymflow.sbs/api/graph/v21.0 */
export function getWhatsAppApiUrl(): string {
  const cfg = getWhatsAppConfig()
  return `${cfg.WHATSAPP_BASE_URL.replace(/\/$/, '')}/${cfg.WHATSAPP_API_VERSION}`
}

/**
 * Full messages endpoint for the configured phone number.
 * https://graph.gymflow.sbs/api/graph/v21.0/<phone_number_id>/messages
 */
export function getWhatsAppMessagesUrl(): string {
  const cfg = getWhatsAppConfig()
  return `${getWhatsAppApiUrl()}/${cfg.WHATSAPP_PHONE_NUMBER_ID}/messages`
}

/** https://graph.gymflow.sbs/api/graph/v21.0/<media_id> */
export function getWhatsAppMediaUrl(mediaId: string): string {
  return `${getWhatsAppApiUrl()}/${mediaId}`
}

// ─── Auth header ──────────────────────────────────────────────────────────────

export function getWhatsAppAuthHeader(): { Authorization: string } {
  const cfg = getWhatsAppConfig()
  return { Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}` }
}

// ─── Logging helper (redacts secrets) ────────────────────────────────────────

export function redactConfig(cfg: WhatsAppEnv): Record<string, string> {
  return {
    WHATSAPP_VERIFY_TOKEN:    '***REDACTED***',
    WHATSAPP_APP_SECRET:      '***REDACTED***',
    WHATSAPP_PHONE_NUMBER_ID: cfg.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN:    `${cfg.WHATSAPP_ACCESS_TOKEN.slice(0, 10)}…***REDACTED***`,
    WHATSAPP_API_VERSION:     cfg.WHATSAPP_API_VERSION,
    WHATSAPP_BASE_URL:        cfg.WHATSAPP_BASE_URL,
  }
}
