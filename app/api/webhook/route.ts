/**
 * app/api/webhook/route.ts
 *
 * Meta WhatsApp Cloud API — Webhook Endpoint
 * URL: https://graph.gymflow.sbs/api/webhook
 *
 * This is NOT a proxy. It is GymFlow's own webhook receiver.
 *
 * ── GET ──────────────────────────────────────────────────────────────────────
 * Meta calls GET once during webhook registration to verify the endpoint.
 * We validate hub.verify_token and respond with hub.challenge.
 *
 * ── POST ─────────────────────────────────────────────────────────────────────
 * Meta sends all events here: messages, status updates, read receipts.
 *
 * Flow:
 *   1. Verify X-Hub-Signature-256 (reject immediately if invalid)
 *   2. Parse raw body as JSON
 *   3. Return HTTP 200 to Meta immediately (< 20 ms)
 *   4. Process events asynchronously via services/whatsapp/webhook.ts
 *
 * Security: signature verification uses timing-safe HMAC comparison.
 * Nothing sensitive is ever logged.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, extractRawBody } from '@/services/whatsapp/signature'
import { processWebhookPayload } from '@/services/whatsapp/webhook'
import { apiLogger } from '@/lib/logger'
import type { MetaWebhookPayload } from '@/types/whatsapp'
import { WhatsAppSignatureError } from '@/types/whatsapp'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─── GET — webhook verification ───────────────────────────────────────────────

/**
 * Meta verification handshake.
 *
 * Expected query params:
 *   hub.mode         = "subscribe"
 *   hub.verify_token = <must match WHATSAPP_VERIFY_TOKEN>
 *   hub.challenge    = <random string to echo back>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const log = apiLogger('webhook_verify')

  const params    = req.nextUrl.searchParams
  const mode      = params.get('hub.mode')
  const token     = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    log.warn('Webhook verification rejected — missing params', { mode })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (!expectedToken) {
    log.error('WHATSAPP_VERIFY_TOKEN is not set')
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  // Constant-time comparison to prevent token enumeration
  const provided = Buffer.from(token)
  const expected = Buffer.from(expectedToken)

  if (
    provided.length !== expected.length ||
    !require('crypto').timingSafeEqual(provided, expected)
  ) {
    log.warn('Webhook verification rejected — token mismatch')
    return new NextResponse('Forbidden', { status: 403 })
  }

  log.info('Webhook verified successfully')
  return new NextResponse(challenge, {
    status:  200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

// ─── POST — receive events ────────────────────────────────────────────────────

/**
 * Receive and process Meta webhook events.
 *
 * CRITICAL: Must return HTTP 200 as fast as possible.
 * If Meta doesn't receive 200 within ~20 seconds it will retry.
 * All heavy processing is deferred asynchronously.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log     = apiLogger('webhook_receive')
  const startMs = Date.now()

  // ── 1. Extract raw body (must be done before any parsing) ──────────────────
  let rawBody: string
  try {
    rawBody = await extractRawBody(req)
  } catch (err) {
    log.error('Failed to read webhook body', err)
    return new NextResponse('Bad Request', { status: 400 })
  }

  // ── 2. Verify X-Hub-Signature-256 ─────────────────────────────────────────
  try {
    verifyWebhookSignature(rawBody, req.headers.get('x-hub-signature-256'))
  } catch (err) {
    if (err instanceof WhatsAppSignatureError) {
      log.warn('Webhook signature verification failed')
      return new NextResponse('Unauthorized', { status: 401 })
    }
    log.error('Signature verification error', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }

  // ── 3. Parse JSON ──────────────────────────────────────────────────────────
  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch {
    log.warn('Webhook body is not valid JSON')
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Guard: must be a whatsapp_business_account event
  if (payload.object !== 'whatsapp_business_account') {
    log.warn('Unknown webhook object type', { object: payload.object })
    return new NextResponse('OK', { status: 200 }) // still 200 — don't let Meta retry
  }

  // ── 4. Return 200 to Meta immediately ─────────────────────────────────────
  // Processing happens in the background — we must NOT await it here.
  setImmediate(() => {
    processWebhookPayload(payload, log.requestId, startMs).catch(err => {
      log.error('Async webhook processing failed', err)
    })
  })

  log.info('Webhook accepted', { durationMs: Date.now() - startMs })
  return new NextResponse('OK', { status: 200 })
}
