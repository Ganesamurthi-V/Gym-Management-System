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
import { randomBytes } from 'crypto'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { generateInvitationToken } from '@/lib/member-invitation'

export const dynamic = 'force-dynamic'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL')
  return createServiceClient(url, key)
}

// Token generation lives in lib/member-invitation.ts so the member app can
// resolve tokens with a direct lookup instead of scanning every auth user.

export async function POST(req: NextRequest) {
  const log = apiLogger('MEMBER_APP_INVITE')
  try {
    log.start('AUTH')
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    log.end('AUTH')

    if (authErr || !user) {
      log.summary(401)
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
    }

    const { allowed } = await checkRateLimit(user.id, '/api/member-app/invite', ROUTE_LIMITS.DEFAULT)
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

    let body: { memberId: string }
    try { body = await req.json() } catch {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 })
    }

    const { memberId } = body
    if (!memberId) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'memberId is required' } }, { status: 400 })
    }

    // Fetch member and verify ownership
    log.start('FETCH_MEMBER')
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .select('id, name, phone, email, auth_user_id, portal_enabled, invitation_status')
      .eq('id', memberId)
      .eq('gym_id', gym.id)
      .single()
    log.end('FETCH_MEMBER')

    if (memberErr || !member) {
      log.summary(404)
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found in your gym' } }, { status: 404 })
    }

    if (!member.phone) {
      log.summary(400)
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Member has no phone number' } }, { status: 400 })
    }

    const serviceSupabase = getServiceSupabase()
    let authUserId = member.auth_user_id

    // If member doesn't have an Auth identity yet, create one
    if (!authUserId) {
      log.start('CREATE_AUTH_USER')
      const email = member.email || `member-${memberId.slice(0, 8)}@gymflow.sbs`
      const tempPassword = randomBytes(16).toString('base64url')

      const { data: authData, error: authCreateErr } = await serviceSupabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true, // Skip email verification — invited by owner
        user_metadata: {
          member_id: memberId,
          gym_id: gym.id,
          role: 'member',
        },
      })
      log.end('CREATE_AUTH_USER')

      if (authCreateErr || !authData.user) {
        // If user already exists with that email, try to find them
        if (authCreateErr?.message?.includes('already been registered')) {
          const { data: existingUsers } = await serviceSupabase.auth.admin.listUsers()
          const existing = existingUsers?.users?.find(u => u.email === email)
          if (existing) {
            authUserId = existing.id
          } else {
            log.error('Failed to create auth user', authCreateErr)
            log.summary(500)
            return NextResponse.json({ success: false, error: { code: 'AUTH_FAILED', message: 'Failed to create member account' } }, { status: 500 })
          }
        } else {
          log.error('Failed to create auth user', authCreateErr)
          log.summary(500)
          return NextResponse.json({ success: false, error: { code: 'AUTH_FAILED', message: 'Failed to create member account' } }, { status: 500 })
        }
      } else {
        authUserId = authData.user.id
      }

      // Link auth_user_id to the member row (service-role bypasses the guard trigger)
      log.start('LINK_AUTH')
      const { error: linkErr } = await serviceSupabase
        .from('members')
        .update({ auth_user_id: authUserId })
        .eq('id', memberId)
        .eq('gym_id', gym.id)
      log.end('LINK_AUTH')

      if (linkErr) {
        log.error('Failed to link auth user to member', linkErr)
        log.summary(500)
        return NextResponse.json({ success: false, error: { code: 'LINK_FAILED', message: 'Failed to link account to member' } }, { status: 500 })
      }
    }

    // Generate a secure invitation token and store it as user metadata
    const token = generateInvitationToken(memberId)
    log.start('SET_TOKEN')
    await serviceSupabase.auth.admin.updateUserById(authUserId!, {
      user_metadata: {
        invitation_token: token,
        invited_at: new Date().toISOString(),
        gym_id: gym.id,
        member_id: memberId,
        role: 'member',
      },
    })
    log.end('SET_TOKEN')

    // Update portal status on the member
    log.start('UPDATE_STATUS')
    await serviceSupabase
      .from('members')
      .update({
        portal_enabled: true,
        invitation_status: 'pending',
        invitation_sent_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .eq('gym_id', gym.id)
    log.end('UPDATE_STATUS')

    // Log activity
    await serviceSupabase.from('member_portal_activity').insert({
      gym_id: gym.id,
      member_id: memberId,
      activity: 'invitation_resent',
      performed_by: 'owner',
    })

    // Send WhatsApp invitation with activation link
    log.start('SEND_WHATSAPP')
    const gymName = (await supabase.from('gyms').select('name').eq('id', gym.id).single()).data?.name ?? 'Your Gym'
    const sendResult = await sendWhatsAppTemplate('member_app_invitation', {
      phone: member.phone,
      gymName,
      memberName: member.name,
      invitationToken: token,
    })
    log.end('SEND_WHATSAPP')

    // Invalidate member app cache
    await deleteCache(cacheKeys.memberApp(gym.id))

    if (!sendResult.success) {
      log.warn('WhatsApp send failed but invitation is active', { error: sendResult.error })
      // Don't fail the request — the invitation is stored, member can still use the link
      log.summary(200)
      return NextResponse.json({
        success: true,
        data: {
          memberId,
          whatsappSent: false,
          activationUrl: `https://member.gymflow.sbs/activate/${token}`,
        },
        meta: { request_id: log.requestId },
      })
    }

    log.info('Invitation sent successfully', { memberId })
    log.summary(200)
    return NextResponse.json({
      success: true,
      data: {
        memberId,
        whatsappSent: true,
        activationUrl: `https://member.gymflow.sbs/activate/${token}`,
      },
      meta: { request_id: log.requestId },
    })
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/member-app/invite', err)
    log.summary(500)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}
