/**
 * WhatsApp Webhook Verification
 * 
 * Handles GET request verification from Meta.
 * Meta sends a challenge token that must be echoed back.
 */

import { NextRequest, NextResponse } from 'next/server'
import { webhookVerificationSchema } from './webhookSchemas'
import { RequestLogger } from '@/lib/logger'

/**
 * Verify webhook endpoint with Meta
 * 
 * Meta sends:
 *   GET /webhook?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=yyy
 * 
 * We must:
 *   1. Validate hub.mode === 'subscribe'
 *   2. Validate hub.verify_token matches our secret
 *   3. Return hub.challenge as plain text with 200
 * 
 * Security: Never log the verify token
 */
export async function verifyWebhook(
  req: NextRequest,
  log: RequestLogger
): Promise<NextResponse> {
  const startTime = performance.now()

  try {
    const searchParams = req.nextUrl.searchParams
    
    // Extract query parameters
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    // Validate query parameters structure
    const validation = webhookVerificationSchema.safeParse({
      'hub.mode': mode,
      'hub.verify_token': token,
      'hub.challenge': challenge,
    })

    if (!validation.success) {
      log.warn('Webhook verification failed - invalid query parameters', {
        errors: validation.error.errors,
      })
      return NextResponse.json(
        { error: 'Invalid verification parameters' },
        { status: 403 }
      )
    }

    // Get verify token from environment
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

    if (!verifyToken) {
      log.error('Webhook verification failed - WHATSAPP_VERIFY_TOKEN not configured', 
        new Error('Missing WHATSAPP_VERIFY_TOKEN environment variable')
      )
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      )
    }

    // Verify token matches
    if (token !== verifyToken) {
      log.warn('Webhook verification failed - token mismatch', {
        tokenLength: token?.length,
        expectedLength: verifyToken.length,
      })
      return NextResponse.json(
        { error: 'Invalid verify token' },
        { status: 403 }
      )
    }

    // Success - return challenge
    const durationMs = Math.round(performance.now() - startTime)
    log.info('Webhook verification successful', {
      durationMs,
      challengeLength: challenge?.length,
    })

    // Return challenge as plain text (not JSON)
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  } catch (error) {
    log.error('Webhook verification error', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
