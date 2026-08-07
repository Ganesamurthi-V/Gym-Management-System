/**
 * POST /api/activate/verify
 *
 * Validates an invitation token and returns the member's display info.
 * Public endpoint — the member hasn't logged in yet.
 *
 * Checks:
 *  ✔ Token resolves to an auth user and matches exactly
 *  ✔ Token not expired (24h from invited_at)
 *  ✔ Member exists and belongs to the token's gym
 *  ✔ Portal not disabled or suspended by the owner
 *  ✔ Not already activated
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getServiceSupabase,
  resolveInvitationToken,
  isPlaceholderEmail,
} from '@/lib/activation-token'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

const fail = (error: string, status: number, code?: string) =>
  NextResponse.json({ success: false, error, code }, { status, headers: NO_STORE })

export async function POST(req: NextRequest) {
  try {
    let body: { token: string }
    try { body = await req.json() } catch {
      return fail('Invalid request', 400)
    }

    const { token } = body
    if (!token || token.length < 20) return fail('Invalid token', 400)

    const supabase = getServiceSupabase()
    const resolved = await resolveInvitationToken(supabase, token)

    if (!resolved.ok) {
      switch (resolved.reason) {
        case 'expired':
          return fail(
            'This invitation link has expired. Please ask your gym to send a new one.',
            410, 'expired',
          )
        case 'incomplete':
          return fail(
            'Incomplete invitation data. Contact your gym for a new link.',
            400, 'incomplete',
          )
        case 'lookup_failed':
          // Distinguished from "invalid" so the UI can offer a retry instead of
          // telling the member their link is dead because of our outage.
          return fail(
            'We could not verify your link right now. Please try again in a moment.',
            503, 'lookup_failed',
          )
        default:
          return fail(
            'This invitation link is invalid or has already been used.',
            404, 'not_found',
          )
      }
    }

    const { authUser, memberId, gymId } = resolved

    // Fetch member and gym together — one round trip instead of two.
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .select('name, phone, email, invitation_status, portal_enabled, portal_suspended, gyms!inner(name)')
      .eq('id', memberId)
      .eq('gym_id', gymId)
      .maybeSingle()

    if (memberErr) {
      return fail('We could not verify your link right now. Please try again in a moment.', 503, 'lookup_failed')
    }
    if (!member) {
      return fail('Member record not found. Contact your gym.', 404, 'not_found')
    }

    // The owner can revoke access between sending the invite and the member
    // opening it. Previously neither flag was checked, so a disabled or
    // suspended member could still activate a working account.
    if (member.portal_suspended) {
      return fail('Your portal access is currently suspended. Please contact your gym.', 403, 'suspended')
    }
    if (member.portal_enabled === false) {
      return fail('Your gym has disabled portal access. Please contact your gym.', 403, 'disabled')
    }

    if (member.invitation_status === 'activated') {
      return fail('This account has already been activated. Please go to login.', 409, 'already_activated')
    }

    const gymRow = (member as unknown as { gyms?: { name?: string } | null }).gyms

    // Only prefill a real address. The owner app assigns a synthetic
    // `member-<id8>@gymflow.sbs` placeholder when creating the auth identity;
    // prefilling that meant a member who tapped straight through sent the
    // verification email to a mailbox that does not exist, then waited forever.
    const candidateEmail = member.email ?? authUser.email ?? null
    const prefillEmail = isPlaceholderEmail(candidateEmail) ? null : candidateEmail

    return NextResponse.json(
      {
        success: true,
        data: {
          memberId,
          memberName: member.name,
          phone: member.phone,
          gymName: gymRow?.name ?? 'Your Gym',
          gymId,
          currentEmail: prefillEmail,
        },
      },
      { headers: NO_STORE },
    )
  } catch (err) {
    console.error('[activate/verify] error:', err)
    return fail('Server error', 500)
  }
}
