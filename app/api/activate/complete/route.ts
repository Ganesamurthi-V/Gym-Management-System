/**
 * POST /api/activate/complete
 *
 * Member submits email + password on the activation page.
 *
 * Flow:
 *  1. Resolves + validates the invitation token
 *  2. Validates the form and the portal's current state
 *  3. Sets the chosen email + password on the Auth user (email_confirm: true)
 *  4. Sends the verification email
 *  5. Records the email on the member row
 *
 * `email_confirm: true` is required — Supabase refuses signInWithPassword for an
 * unconfirmed address, so without it the password the member just chose would be
 * unusable. The emailed link therefore confirms the address is reachable rather
 * than gating the account.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, resolveInvitationToken } from '@/lib/member/activation-token'
import { sendVerificationEmail } from '@/lib/member/activation-email'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status, headers: NO_STORE })

export async function POST(req: NextRequest) {
  try {
    let body: { token: string; email: string; password: string }
    try { body = await req.json() } catch {
      return fail('Invalid request', 400)
    }

    const { token, email, password } = body

    // ── Input validation ──────────────────────────────────────────────────────
    if (!token || token.length < 20) return fail('Invalid token', 400)

    const trimmedEmail = email?.trim().toLowerCase()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return fail('Please enter a valid email address', 400)
    }
    if (!password || password.length < 8) {
      return fail('Password must be at least 8 characters', 400)
    }
    if (!/\d/.test(password)) {
      return fail('Password must contain at least one number', 400)
    }

    const supabase = getServiceSupabase()

    // ── Resolve the invitation ────────────────────────────────────────────────
    const resolved = await resolveInvitationToken(supabase, token)
    if (!resolved.ok) {
      switch (resolved.reason) {
        case 'expired':
          return fail('This invitation link has expired. Please ask your gym to send a new one.', 410, { code: 'expired' })
        case 'incomplete':
          return fail('Incomplete invitation data', 400, { code: 'incomplete' })
        case 'lookup_failed':
          return fail('We could not verify your link right now. Please try again in a moment.', 503, { code: 'lookup_failed' })
        default:
          return fail('This invitation link is invalid or has already been used.', 404, { code: 'not_found' })
      }
    }

    const { authUser, memberId, gymId } = resolved

    // ── Re-check portal state at submit time ──────────────────────────────────
    // The owner may have suspended or disabled access after the page loaded.
    const { data: member } = await supabase
      .from('members')
      .select('invitation_status, portal_enabled, portal_suspended')
      .eq('id', memberId)
      .eq('gym_id', gymId)
      .maybeSingle()

    if (!member) return fail('Member record not found. Contact your gym.', 404)
    if (member.portal_suspended) {
      return fail('Your portal access is currently suspended. Please contact your gym.', 403, { code: 'suspended' })
    }
    if (member.portal_enabled === false) {
      return fail('Your gym has disabled portal access. Please contact your gym.', 403, { code: 'disabled' })
    }
    if (member.invitation_status === 'activated') {
      return fail('This account has already been activated. Please go to login.', 409, { code: 'already_activated' })
    }

    // ── Set the chosen email + password ───────────────────────────────────────
    // Uniqueness is enforced by Supabase itself here. The previous version
    // scanned every auth user to pre-check the address, which was both O(users)
    // and racy — two members could pass the check and then collide.
    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        ...authUser.user_metadata,
        pending_email: trimmedEmail,
        activation_step: 'email_verification_pending',
      },
    })

    if (updateErr) {
      const msg = updateErr.message ?? ''
      console.error('[activate/complete] auth update failed:', msg)
      if (/already been registered|already registered|duplicate/i.test(msg)) {
        return fail('This email is already in use. Please choose a different one.', 409, { code: 'email_taken' })
      }
      return fail('Failed to set up your account. Please try again.', 500)
    }

    // ── Persist the email on the member row ───────────────────────────────────
    // Done BEFORE sending the email so that a throttled send cannot leave the
    // auth user updated while the member row still holds the old address.
    await supabase
      .from('members')
      .update({ email: trimmedEmail, invitation_status: 'delivered' })
      .eq('id', memberId)
      .eq('gym_id', gymId)

    // ── Send the verification email ───────────────────────────────────────────
    const send = await sendVerificationEmail(trimmedEmail)

    if (!send.ok && send.kind === 'failed') {
      return fail(`Failed to send verification email: ${send.message}`, 500, {
        // The account IS set up, so the client can offer a resend rather than
        // making the member restart the whole flow.
        canResend: true,
        memberId,
      })
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          authUserId: authUser.id,
          memberId,
          // Surfaced so the waiting screen can start its resend cooldown
          // correctly instead of letting the member tap into a 429.
          emailSent: send.ok,
          retryAfterSeconds: send.ok ? 0 : send.retryAfterSeconds,
        },
        message: send.ok
          ? 'Verification email sent. Please check your inbox.'
          : send.message,
      },
      { headers: NO_STORE },
    )
  } catch (err) {
    console.error('[activate/complete] error:', err)
    return fail('Server error', 500)
  }
}
