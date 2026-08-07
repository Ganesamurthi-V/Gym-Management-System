/**
 * POST /api/activate/resend
 *
 * Re-sends the verification email for an in-flight activation.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Supabase magic links are SINGLE USE. Verified against the live project: the
 * first GET of the emailed link succeeds, and a second GET returns
 * `error_code=otp_expired`. Email providers, link previewers and antivirus
 * scanners routinely fetch links in messages, which burns the token before the
 * member ever taps it — the reported "link expired after 5-10 seconds".
 *
 * Previously there was no recovery at all: the waiting screen only offered
 * "change email", and the error page said "contact your gym". A single automated
 * prefetch dead-ended the entire invitation. Now the member can re-send.
 *
 * Authorization: the caller must present the still-valid invitation token, so
 * this cannot be used to spray email at arbitrary addresses. The destination is
 * always the address already stored for that member — never taken from the request.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase, resolveInvitationToken } from '@/lib/activation-token'
import { sendVerificationEmail } from '@/lib/activation-email'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status, headers: NO_STORE })

export async function POST(req: NextRequest) {
  try {
    let body: { token?: string }
    try { body = await req.json() } catch {
      return fail('Invalid request', 400)
    }

    const token = body.token
    if (!token || token.length < 20) return fail('Invalid token', 400)

    const supabase = getServiceSupabase()
    const resolved = await resolveInvitationToken(supabase, token)

    if (!resolved.ok) {
      switch (resolved.reason) {
        case 'expired':
          return fail('This invitation has expired. Please ask your gym to send a new one.', 410, { code: 'expired' })
        case 'lookup_failed':
          return fail('Could not resend right now. Please try again in a moment.', 503, { code: 'lookup_failed' })
        default:
          return fail('This invitation link is no longer valid.', 404, { code: 'not_found' })
      }
    }

    const { memberId, gymId, authUser } = resolved

    const { data: member } = await supabase
      .from('members')
      .select('email, invitation_status, portal_enabled, portal_suspended')
      .eq('id', memberId)
      .eq('gym_id', gymId)
      .maybeSingle()

    if (!member) return fail('Member record not found.', 404)
    if (member.portal_suspended) {
      return fail('Your portal access is currently suspended.', 403, { code: 'suspended' })
    }
    if (member.portal_enabled === false) {
      return fail('Your gym has disabled portal access.', 403, { code: 'disabled' })
    }
    if (member.invitation_status === 'activated') {
      // Already done — tell the client so it can show success instead of resending.
      return NextResponse.json(
        { success: true, alreadyActivated: true },
        { headers: NO_STORE },
      )
    }

    // Destination comes from stored state, never from the request body.
    const target = member.email ?? (authUser.user_metadata?.pending_email as string | undefined) ?? authUser.email
    if (!target) {
      return fail('No email on file yet. Please enter your email first.', 400, { code: 'no_email' })
    }

    const send = await sendVerificationEmail(target)

    if (!send.ok) {
      if (send.kind === 'rate_limited') {
        return fail(send.message, 429, {
          code: 'rate_limited',
          retryAfterSeconds: send.retryAfterSeconds,
        })
      }
      return fail(`Could not send the email: ${send.message}`, 500)
    }

    return NextResponse.json(
      { success: true, email: target, message: 'Verification email sent again.' },
      { headers: NO_STORE },
    )
  } catch (err) {
    console.error('[activate/resend] error:', err)
    return fail('Server error', 500)
  }
}
