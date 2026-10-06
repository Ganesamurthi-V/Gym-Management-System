import { Resend } from 'resend'

/**
 * Resend client and support-mailbox config for the admin inbox.
 *
 * The root app has its own lib/email/resend.ts for transactional templates; this is the
 * admin app's, because it is a separate deployment with its own env. It is built lazily,
 * so a missing key fails the request that needed it rather than the whole build.
 */

let client: Resend | null = null

export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('Missing RESEND_API_KEY')
  client ??= new Resend(key)
  return client
}

export function getWebhookSecret(): string {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) throw new Error('Missing RESEND_WEBHOOK_SECRET')
  return secret
}

/** The mailbox this inbox belongs to, and the name replies are sent under. */
export function getSupportMailbox(): { address: string; from: string } {
  const address = (process.env.SUPPORT_EMAIL_ADDRESS ?? 'support@gymflow.sbs').toLowerCase()
  const name = process.env.SUPPORT_EMAIL_FROM_NAME ?? 'GymFlow Support'
  return { address, from: `${name} <${address}>` }
}
