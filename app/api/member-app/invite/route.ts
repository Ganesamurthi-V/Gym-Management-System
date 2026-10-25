/**
 * POST /api/member-app/invite
 *
 * Handles the full member portal invitation flow:
 * 1. Generates a secure invitation token
 * 2. Creates a Supabase Auth identity for the member (or reuses existing)
 * 3. Links auth_user_id on the members row (requires service-role)
 * 4. Sends the member_app_invitation WhatsApp template with the activation link
 * 5. Updates portal status columns
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY environment variable.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/sender'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { getGymForUser } from '@/lib/supabase/queries'
import { apiLogger } from '@/lib/logger'
import { prepareMemberInvitation } from '@/lib/member-invitation-server'
import { passesCsrf, csrfRejected, UUID_RE } from '@/app/api/_guard'
import { assertGymWritable } from '@/lib/subscriptionGuard'
import { gymMayManageMemberApp, splitMemberAppEligible, MEMBER_APP_NOT_INCLUDED_MESSAGE } from '@/lib/member/memberAppAccess'

export const dynamic = 'force-dynamic'

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL')
  return createServiceClient(url, key)
}

// Token generation lives in lib/member-invitation.ts so the member app can
// resolve tokens with a direct lookup instead of scanning every auth user.

// HTTP status for each prepareMemberInvitation failure code (unlisted codes are 500).
const PREPARE_ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  EMAIL_IN_USE: 409,
  OWNER_EMAIL: 409,
  MEMBER_EMAIL_IN_USE: 409,
}

export async function POST(req: NextRequest) {
  const log = apiLogger('MEMBER_APP_INVITE')
  try {
    if (!passesCsrf(req)) return csrfRejected()

    log.start('AUTH')
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    log.end('AUTH')

    if (authErr || !user) {
      log.summary(401)
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
    }

    // Every call can send a real WhatsApp message and create an auth user, so
    // this is capped well below the 30/min default.
    const { allowed } = await checkRateLimit(user.id, '/api/member-app/invite', 10)
    if (!allowed) {
      log.summary(429)
      return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })
    }

    log.start('GET_GYM')
    const gym = await getGymForUser(supabase, user.id)
    log.end('GET_GYM')
    if (!gym) {
      log.summary(404)
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    }

    // Plan and subscription come from the gym row loaded above, never from the request.
    const readOnly = assertGymWritable(gym)
    if (readOnly) return readOnly
    if (!gymMayManageMemberApp(gym)) {
      log.summary(403)
      return NextResponse.json({ success: false, error: { code: 'PLAN_REQUIRED', message: MEMBER_APP_NOT_INCLUDED_MESSAGE } }, { status: 403 })
    }

    let body: { memberId: string }
    try { body = await req.json() } catch {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 })
    }

    const memberId = body?.memberId
    if (typeof memberId !== 'string' || !UUID_RE.test(memberId)) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'A valid memberId is required' } }, { status: 400 })
    }

    // A trial covers only its first members by join date; fail closed if that cannot be read.
    const { allowed: coveredIds } = await splitMemberAppEligible(supabase, gym, [memberId])
    if (coveredIds.length === 0) {
      log.summary(403)
      return NextResponse.json({ success: false, error: { code: 'PLAN_REQUIRED', message: MEMBER_APP_NOT_INCLUDED_MESSAGE } }, { status: 403 })
    }

    // Member fetch, auth identity, token and status columns live in prepareMemberInvitation so
    // the bulk-invite queue worker runs exactly the same steps just before each send.
    log.start('PREPARE_INVITATION')
    const serviceSupabase = getServiceSupabase()
    const prepared = await prepareMemberInvitation(serviceSupabase, { gymId: gym.id, memberId })
    log.end('PREPARE_INVITATION')

    if (!prepared.ok) {
      const status = PREPARE_ERROR_STATUS[prepared.code] ?? 500
      if (status >= 500) log.error(`Invitation preparation failed: ${prepared.code}`)
      log.summary(status)
      return NextResponse.json(
        { success: false, error: { code: prepared.code, message: prepared.message } },
        { status, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    const { token, member } = prepared

    // Send WhatsApp invitation with activation link
    log.start('SEND_WHATSAPP')
    const gymName = (await supabase.from('gyms').select('name').eq('id', gym.id).single()).data?.name ?? 'Your Gym'
    const sendResult = await sendWhatsAppTemplate('member_app_invitation', {
      phone: member.phone,
      gymName,
      memberName: member.name,
      invitationToken: token,
      memberRowId: memberId,
      gymId: gym.id,
    })
    log.end('SEND_WHATSAPP')

    // Invalidate member app cache

    if (sendResult.skipped) {
      // The platform admin has switched WhatsApp off for this gym: nothing was sent.
      log.warn('WhatsApp invitation not sent: gym switch is off')
      log.summary(403)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WHATSAPP_DISABLED',
            message: 'WhatsApp messages are turned off for your gym, so the invitation was not sent. Please contact GymFlow support.',
          },
          data: { memberId, invitationCreated: true, whatsappSent: false },
          meta: { request_id: log.requestId },
        },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    if (!sendResult.success) {
      log.warn('WhatsApp send failed but invitation is active', { error: sendResult.error })
      log.summary(502)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WHATSAPP_NOT_DELIVERED',
            message: `WhatsApp couldn't confirm delivery to ${member.name}. Check the member's WhatsApp number and try again.`,
          },
          data: { memberId, invitationCreated: true, whatsappSent: false },
          meta: { request_id: log.requestId },
        },
        { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    const { error: activityErr } = await serviceSupabase.from('member_portal_activity').insert({
      gym_id: gym.id,
      member_id: memberId,
      activity: 'invitation_resent',
      performed_by: 'owner',
    })
    if (activityErr) log.warn('Invitation sent but activity log failed', { error: activityErr.message })

    log.info('Invitation sent successfully', { memberId })
    log.summary(200)
    return NextResponse.json(
      {
        success: true,
        message: `Invitation sent to ${member.name} via WhatsApp`,
        data: { memberId, invitationCreated: true, whatsappSent: true },
        meta: { request_id: log.requestId },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/member-app/invite', err)
    log.summary(500)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}
