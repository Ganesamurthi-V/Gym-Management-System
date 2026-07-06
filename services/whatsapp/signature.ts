/**
 * services/whatsapp/signature.ts
 *
 * HMAC-SHA256 signature verification for incoming Meta webhook events.
 *
 * Meta signs every POST webhook body with:
 *   X-Hub-Signature-256: sha256=<hex>
 *
 * We verify using a timing-safe comparison to prevent timing attacks.
 * The app secret is read from WHATSAPP_APP_SECRET env var — never logged.
 *
 * Reference: https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
 */

import * as crypto from 'crypto'
import { WhatsAppSignatureError } from '@/types/whatsapp'

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 *
 * @param rawBody   - Raw UTF-8 body bytes (must NOT be parsed JSON)
 * @param signature - Value of the X-Hub-Signature-256 header
 * @throws {WhatsAppSignatureError} if the signature is invalid or missing
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): void {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    throw new Error('WHATSAPP_APP_SECRET is not configured')
  }

  if (!signature) {
    throw new WhatsAppSignatureError()
  }

  // Header format: "sha256=<hex>"
  const prefix = 'sha256='
  if (!signature.startsWith(prefix)) {
    throw new WhatsAppSignatureError()
  }

  const receivedHex = signature.slice(prefix.length)

  // Compute expected HMAC
  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')

  // Constant-time comparison — prevents timing side-channel attacks
  let signaturesMatch: boolean
  try {
    signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(receivedHex, 'hex'),
      Buffer.from(expectedHex, 'hex'),
    )
  } catch {
    // Buffer lengths mismatch — definitely invalid
    throw new WhatsAppSignatureError()
  }

  if (!signaturesMatch) {
    throw new WhatsAppSignatureError()
  }
}

/**
 * Extract the raw body string from a Next.js Request.
 * Must be called ONCE before any body parsing.
 */
export async function extractRawBody(req: Request): Promise<string> {
  const buf = await req.arrayBuffer()
  return new TextDecoder('utf-8').decode(buf)
}
