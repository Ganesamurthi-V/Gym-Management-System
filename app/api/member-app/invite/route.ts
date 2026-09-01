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
import { generateInvitationToken, reusableInvitationToken } from '@/lib/member-invitation'
import { hasOwnerRegistrationMarker } from '@/lib/auth/owner-registration'

export const dynamic = 'force-dynamic'

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL
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
        app_metadata: { role: 'member' },
      })
      log.end('CREATE_AUTH_USER')

      if (authCreateErr || !authData.user) {
        // If user already exists with that email, try to find them
        if (authCreateErr?.message?.includes('already been registered')) {
          let existing = null
          for (let page = 1; page <= 50 && !existing; page += 1) {
            const { data: existingUsers } = await serviceSupabase.auth.admin.listUsers({ page, perPage: 1000 })
            existing = existingUsers?.users.find((user) => user.email === email) ?? null
            if (!existingUsers || existingUsers.users.length < 1000) break
          }

          const belongsToThisMember =
            existing?.user_metadata?.role === 'member' &&
            existing.user_metadata.member_id === memberId &&
            existing.user_metadata.gym_id === gym.id

          if (existing && belongsToThisMember) {
            authUserId = existing.id
          } else {
            log.summary(409)
            return NextResponse.json(
              { success: false, error: { code: 'EMAIL_IN_USE', message: 'This email is already linked to another account. Use a different member email.' } },
              { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
            )
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

    const { data: authUserData, error: authUserErr } =
      await serviceSupabase.auth.admin.getUserById(authUserId!)
    const authUser = authUserData.user
    if (authUserErr || !authUser) {
      log.error('Failed to load member auth user', authUserErr)
      log.summary(500)
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_FAILED', message: 'Failed to prepare member invitation' } },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    const { data: ownerGym, error: ownerGymErr } = await serviceSupabase
      .from('gyms')
      .select('id')
      .eq('owner_id', authUser.id)
      .maybeSingle()

    if (ownerGymErr) {
      log.error('Failed to verify member auth identity', ownerGymErr)
      log.summary(500)
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_FAILED', message: 'Failed to verify member account' } },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    if (ownerGym?.id || hasOwnerRegistrationMarker(authUser)) {
      log.summary(409)
      return NextResponse.json(
        { success: false, error: { code: 'OWNER_EMAIL', message: 'This email belongs to a gym owner account. Use a different member email.' } },
        { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    const linkedMemberId = authUser.user_metadata?.member_id
    if (typeof linkedMemberId === 'string' && linkedMemberId !== memberId) {
      log.summary(409)
      return NextResponse.json(
        { success: false, error: { code: 'MEMBER_EMAIL_IN_USE', message: 'This email is already linked to another member account.' } },
        { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    const existingToken = member.invitation_status === 'pending'
      ? reusableInvitationToken(
          authUser.user_metadata?.invitation_token,
          authUser.user_metadata?.invited_at,
          memberId,
          authUser.user_metadata?.member_id,
        )
      : null
    const token = existingToken ?? generateInvitationToken(memberId)
    const invitedAt = existingToken
      ? String(authUser.user_metadata.invited_at)
      : new Date().toISOString()

    log.start('SET_TOKEN')
    const { error: tokenErr } = await serviceSupabase.auth.admin.updateUserById(authUserId!, {
      user_metadata: {
        ...authUser.user_metadata,
        invitation_token: token,
        invited_at: invitedAt,
        gym_id: gym.id,
        member_id: memberId,
        role: 'member',
        pending_email: null,
        activation_step: null,
        activated_at: null,
      },
      app_metadata: {
        ...authUser.app_metadata,
        role: 'member',
      },
    })
    log.end('SET_TOKEN')

    if (tokenErr) {
      log.error('Failed to store invitation token', tokenErr)
      log.summary(500)
      return NextResponse.json(
        { success: false, error: { code: 'TOKEN_FAILED', message: 'Failed to prepare member invitation' } },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    log.start('UPDATE_STATUS')
    const { error: statusErr } = await serviceSupabase
      .from('members')
      .update({
        portal_enabled: true,
        invitation_status: 'pending',
        invitation_sent_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .eq('gym_id', gym.id)
    log.end('UPDATE_STATUS')

    if (statusErr) {
      log.error('Failed to update invitation status', statusErr)
      log.summary(500)
      return NextResponse.json(
        { success: false, error: { code: 'STATUS_FAILED', message: 'Failed to prepare member invitation' } },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

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
