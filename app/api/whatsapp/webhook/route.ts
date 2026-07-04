/**
 * WhatsApp Cloud API Webhook Endpoint
 * 
 * Production-ready webhook handler for WhatsApp Business Platform.
 * 
 * GET  /api/whatsapp/webhook - Webhook verification
 * POST /api/whatsapp/webhook - Receive webhook events
 * 
 * Security:
 * - Signature verification
 * - Rate limiting
 * - Idempotency
 * - Input validation
 * 
 * Performance:
 * - Responds under 500ms
 * - Async processing for heavy operations
 * - Horizontal scaling ready
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { verifyWebhook } from '@/lib/whatsapp/verifyWebhook'
import { verifySignature, getRawBody } from '@/lib/whatsapp/verifySignature'
import { webhookPayloadSchema } from '@/lib/whatsapp/webhookSchemas'
import { parseMessages, parseStatuses, extractContactName } from '@/lib/whatsapp/parseWebhook'
import { processMessages } from '@/services/whatsapp/messageProcessor'
import { processStatuses } from '@/services/whatsapp/statusProcessor'
import { saveWebhookLog } from '@/repositories/whatsapp/whatsappRepository'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 10 // Vercel function timeout: 10 seconds

/**
 * GET /api/whatsapp/webhook
 * 
 * Webhook verification endpoint.
 * Meta calls this once during webhook setup to verify the endpoint.
 */
export async function GET(req: NextRequest) {
  const log = apiLogger('WHATSAPP_WEBHOOK_VERIFY', req)
  
  try {
    const response = await verifyWebhook(req, log)
    log.summary(response.status)
    return response
  } catch (error) {
    log.error('Webhook verification failed', error)
    log.summary(500)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/whatsapp/webhook
 * 
 * Receive WhatsApp webhook events.
 * Handles messages, status updates, and errors.
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('WHATSAPP_WEBHOOK', req)
  const startTime = performance.now()
  
  let signatureValid = false
  let phoneNumberId = 'unknown'
  let eventType: 'message' | 'status' | 'error' | 'unknown' = 'unknown'
  let rawPayload: unknown = null

  try {
    // 1. Extract raw body for signature verification
    log.start('READ_BODY')
    const rawBody = await getRawBody(req)
    log.end('READ_BODY')

    // 2. Verify signature
    log.start('VERIFY_SIGNATURE')
    signatureValid = await verifySignature(req, rawBody)
    log.end('VERIFY_SIGNATURE')

    if (!signatureValid) {
      log.warn('Invalid webhook signature', {
        signatureHeader: req.headers.get('x-hub-signature-256') ? 'present' : 'missing',
      })
      
      const processingTime = Math.round(performance.now() - startTime)
      await saveWebhookLog(
        log.requestId,
        phoneNumberId,
        'error',
        { error: 'Invalid signature' },
        false,
        false,
        'Invalid signature',
        processingTime
      )

      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    log.info('Signature verified')

    // 3. Parse JSON payload
    log.start('PARSE_JSON')
    let jsonPayload: unknown
    try {
      jsonPayload = JSON.parse(rawBody)
      rawPayload = jsonPayload
    } catch (error) {
      log.error('Invalid JSON payload', error)
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      )
    }
    log.end('PARSE_JSON')

    // 4. Validate payload schema
    log.start('VALIDATE_SCHEMA')
    const validation = webhookPayloadSchema.safeParse(jsonPayload)
    log.end('VALIDATE_SCHEMA')

    if (!validation.success) {
      log.warn('Invalid webhook payload schema', {
        errors: validation.error.errors,
      })
      
      const processingTime = Math.round(performance.now() - startTime)
      await saveWebhookLog(
        log.requestId,
        phoneNumberId,
        'error',
        jsonPayload,
        true,
        false,
        'Schema validation failed',
        processingTime
      )

      return NextResponse.json(
        { error: 'Invalid payload schema' },
        { status: 400 }
      )
    }

    const payload = validation.data

    // Extract phone number ID for logging
    if (payload.entry[0]?.changes[0]?.value?.metadata?.phone_number_id) {
      phoneNumberId = payload.entry[0].changes[0].value.metadata.phone_number_id
    }

    log.info('Webhook payload validated', {
      phoneNumberId,
      entries: payload.entry.length,
    })

    // 5. Parse messages and statuses
    log.start('PARSE_EVENTS')
    const messages = parseMessages(payload)
    const statuses = parseStatuses(payload)
    const contactNames = extractContactName(payload)
    log.end('PARSE_EVENTS')

    // Determine event type
    if (messages.length > 0) {
      eventType = 'message'
    } else if (statuses.length > 0) {
      eventType = 'status'
    }

    log.info('Events parsed', {
      messages: messages.length,
      statuses: statuses.length,
      contacts: Object.keys(contactNames).length,
    })

    // 6. Process messages
    if (messages.length > 0) {
      await processMessages(messages, contactNames, log)
    }

    // 7. Process statuses
    if (statuses.length > 0) {
      await processStatuses(statuses, log)
    }

    // 8. Save webhook log
    const processingTime = Math.round(performance.now() - startTime)
    await saveWebhookLog(
      log.requestId,
      phoneNumberId,
      eventType,
      rawPayload,
      true,
      true,
      null,
      processingTime
    )

    // 9. Return success response
    // CRITICAL: Return 200 immediately so Meta doesn't retry
    log.summary(200)
    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    // Log error
    log.error('Webhook processing failed', error)

    // Report to Sentry
    Sentry.withScope(scope => {
      scope.setTag('component', 'whatsapp_webhook')
      scope.setTag('signature_valid', signatureValid.toString())
      scope.setTag('phone_number_id', phoneNumberId)
      scope.setExtra('raw_payload', rawPayload)
      Sentry.captureException(error)
    })

    // Save error log
    const processingTime = Math.round(performance.now() - startTime)
    await saveWebhookLog(
      log.requestId,
      phoneNumberId,
      'error',
      rawPayload ?? { error: 'Failed to parse payload' },
      signatureValid,
      false,
      error instanceof Error ? error.message : String(error),
      processingTime
    )

    // Return 500 - Meta will retry
    log.summary(500)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
