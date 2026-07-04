/**
 * WhatsApp Webhook Signature Verification
 * 
 * Verifies that incoming webhooks are actually from Meta.
 * Uses HMAC SHA-256 signature verification.
 */

import { NextRequest } from 'next/server'
import * as crypto from 'crypto'

/**
 * Verify X-Hub-Signature-256 header
 * 
 * Meta signs every webhook request with HMAC SHA-256 using your App Secret.
 * The signature is sent in the X-Hub-Signature-256 header as: sha256=<hex>
 * 
 * Security: This prevents replay attacks and ensures the payload hasn't been tampered with.
 * 
 * @param req - Next.js request object
 * @param rawBody - Raw request body as string (must be exact bytes Meta sent)
 * @returns true if signature is valid
 */
export async function verifySignature(
  req: NextRequest,
  rawBody: string
): Promise<boolean> {
  try {
    // Get signature from header
    const signature = req.headers.get('x-hub-signature-256')
    
    if (!signature) {
      return false
    }

    // Get app secret from environment
    const appSecret = process.env.WHATSAPP_APP_SECRET

    if (!appSecret) {
      throw new Error('WHATSAPP_APP_SECRET environment variable not configured')
    }

    // Extract hex hash from signature (format: "sha256=<hex>")
    const signatureHash = signature.replace('sha256=', '')

    // Compute expected signature
    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signatureHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    )
  } catch (error) {
    // Log error but don't expose details
    console.error('Signature verification error:', error instanceof Error ? error.message : 'Unknown error')
    return false
  }
}

/**
 * Extract raw body from Next.js request
 * 
 * Required for signature verification - we need the exact bytes Meta sent,
 * not the parsed JSON object.
 */
export async function getRawBody(req: NextRequest): Promise<string> {
  try {
    // Clone the request to avoid consuming the body
    const clonedReq = req.clone()
    const arrayBuffer = await clonedReq.arrayBuffer()
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(arrayBuffer)
  } catch (error) {
    console.error('Error reading raw body:', error)
    throw new Error('Failed to read request body')
  }
}
