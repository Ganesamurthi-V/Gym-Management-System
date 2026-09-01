import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  hasLegacyOwnerSignupMetadata,
  hasMemberIdentityMarker,
  hasOwnerRegistrationMarker,
  ownerRegistrationAppMetadata,
} from '@/lib/auth/owner-registration'

/**
 * POST /api/auth/finalize-registration
 *
 * Called by /auth/setup-password immediately after the user sets their password.
 * Creates a minimal `gyms` row (onboarding_completed: false) so the onboarding
 * wizard can find it and populate full gym data.
 *
 * Idempotent: if a gym record already exists for this user, returns 409.
 * The caller (setup-password page) treats 409 as success.
 *
 * HTTP codes returned:
 *   200 — gym record created successfully
 *   400 — malformed request
 *   401 — no valid session
 *   403 — email not yet confirmed
 *   409 — gym record already exists (idempotent — treat as success)
 *   500 — database or unexpected error
 */
export async function POST(_req: NextRequest) {
  try {
    // ── 1. Verify authenticated session ──────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'You must be signed in to complete registration.' } },
        { status: 401 }
      )
    }

    // ── 2. Require confirmed email ────────────────────────────────────────────
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_NOT_CONFIRMED', message: 'Your email address has not been confirmed yet. Please click the verification link in your inbox.' } },
        { status: 403 }
      )
    }

    // ── 3. Use service role client to enforce the registration boundary ──────
    const adminClient = createAdminClient()

    // Auth metadata is a routing hint; the members table is the authoritative
    // guard for legacy member accounts that predate server-owned app_metadata.
    const { data: memberIdentity, error: memberLookupError } = await adminClient
      .from('members')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (memberLookupError) {
      console.error('[auth/finalize-registration] member identity lookup failed:', memberLookupError.message)
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to verify registration status. Please try again.' } },
        { status: 500 },
      )
    }

    if (memberIdentity?.id || hasMemberIdentityMarker(user)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'This account cannot be used to create a gym owner profile.' } },
        { status: 403 },
      )
    }

    // ── 4. Idempotency: check if gym already exists ───────────────────────────
    const { data: existing, error: lookupError } = await adminClient
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (lookupError) {
      console.error('[auth/finalize-registration] registration lookup failed:', lookupError.message)
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to verify registration status. Please try again.' } },
        { status: 500 }
      )
    }

    if (existing?.id) {
      // Already registered — idempotent success, caller treats 409 as OK
      return NextResponse.json(
        { success: true, gymId: existing.id, alreadyExists: true },
        { status: 409 }
      )
    }

    // New signups carry a server-owned app_metadata marker. Promote only the
    // tightly shaped legacy owner signups after the members-table guard above.
    if (!hasOwnerRegistrationMarker(user)) {
      if (!hasLegacyOwnerSignupMetadata(user)) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'This account is not eligible for owner registration.' } },
          { status: 403 },
        )
      }

      const { error: markerError } = await adminClient.auth.admin.updateUserById(user.id, {
        app_metadata: ownerRegistrationAppMetadata(user),
      })
      if (markerError) {
        console.error('[auth/finalize-registration] owner marker update failed:', markerError.message)
        return NextResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'We could not finish creating your account. Please try again.' } },
          { status: 500 },
        )
      }
    }

    // ── 5. Resolve the user's full name from sign-up metadata ─────────────────
    const fullName: string =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      (user.user_metadata?.name    as string | undefined)?.trim() ||
      'My Gym'

    // ── 6. Create minimal gym row — onboarding wizard fills the rest ──────────
    const TRIAL_DAYS = parseInt(process.env.TRIAL_DURATION_DAYS ?? '14', 10)
    const now        = new Date()
    const trialEndsAt = new Date(now)
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS)

    const { data: newGym, error: insertError } = await adminClient
      .from('gyms')
      .insert({
        owner_id:              user.id,
        name:                  fullName,
        onboarding_completed:  false,
        subscription_status:   'trial',
        plan_type:             'trial',
        trial_started_at:      now.toISOString(),
        trial_ends_at:         trialEndsAt.toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !newGym) {
      // Unique constraint violation — race condition, gym was created between
      // our check and this insert. Recover by fetching the existing row.
      if (insertError?.code === '23505') {
        const { data: raceGym } = await adminClient
          .from('gyms')
          .select('id')
          .eq('owner_id', user.id)
          .single()
        return NextResponse.json(
          { success: true, gymId: raceGym?.id ?? null, alreadyExists: true },
          { status: 409 }
        )
      }

      console.error('[auth/finalize-registration] gym insert failed:', insertError?.message ?? 'no row returned')
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'We could not finish creating your account. Please try again.',
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, gymId: newGym.id }, { status: 200 })

  } catch (err: unknown) {
    console.error('[auth/finalize-registration] unexpected error:', err)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'We could not finish creating your account. Please try again.',
        },
      },
      { status: 500 }
    )
  }
}
