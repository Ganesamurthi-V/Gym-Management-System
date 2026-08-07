/**
 * POST /api/activate/status
 *
 * Polled by the "Check Your Email" page to detect when the member has clicked
 * the verification link.
 *
 * ── The bug this route used to have ──────────────────────────────────────────
 * It resolved the token by scanning auth users and then did:
 *
 *     if (!authUser) return { activated: true }   // "token cleared => done"
 *
 * That inference is wrong. A token is missing for several reasons, and only one
 * of them is success:
 *   - activation genuinely completed (token cleared)   → activated
 *   - the token never existed / was mistyped           → NOT activated
 *   - the invitation was revoked or re-sent            → NOT activated
 *   - the user list scan missed it (>1000 users)       → NOT activated
 *   - Supabase returned a transient error              → unknown
 *
 * Because the waiting screen polls immediately on mount, any of those made the
 * page flip straight to "Account Activated!" and send the member to a login they
 * could not complete. Verified against the live project: `verify` returned 404
 * "invalid" for a random token while `status` returned activated=true for the
 * same token.
 *
 * Activation is now only ever reported when positively confirmed against the
 * member row, and every other case returns an explicit state the UI can act on.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getServiceSupabase,
  resolveInvitationToken,
  isMemberActivated,
} from '@/lib/activation-token'

type State = 'waiting' | 'activated' | 'invalid' | 'expired' | 'unknown'

const json = (state: State, extra: Record<string, unknown> = {}) =>
  NextResponse.json(
    { activated: state === 'activated', state, ...extra },
    { headers: { 'Cache-Control': 'no-store' } },
  )

export async function POST(req: NextRequest) {
  try {
    let body: { token?: string; memberId?: string }
    try { body = await req.json() } catch {
      return json('invalid')
    }

    const token = body.token
    if (!token || token.length < 20) return json('invalid')

    const supabase = getServiceSupabase()
    const resolved = await resolveInvitationToken(supabase, token)

    if (resolved.ok) {
      // Token still live. Activation is complete only if the DB says so.
      if (resolved.authUser.user_metadata?.activation_step === 'completed') {
        return json('activated')
      }
      if (await isMemberActivated(supabase, resolved.memberId)) {
        return json('activated')
      }
      return json('waiting')
    }

    // Token no longer resolves. Do NOT assume success — confirm it.
    //
    // `memberId` is supplied by the client from the /complete response, which is
    // how we can still verify activation after the token has been cleared. It is
    // only ever used as a lookup key for a read of that member's own status, so
    // a forged value reveals nothing beyond a boolean the member already knows.
    if (resolved.reason === 'lookup_failed') {
      // Infrastructure hiccup — tell the client to keep waiting, never to proceed.
      return json('unknown')
    }

    if (body.memberId) {
      if (await isMemberActivated(supabase, body.memberId)) {
        return json('activated')
      }
    }

    if (resolved.reason === 'expired') return json('expired')
    return json('invalid')
  } catch (err) {
    console.error('[activate/status] error:', err)
    // Never report success on an exception.
    return json('unknown')
  }
}
