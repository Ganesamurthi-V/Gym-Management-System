import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/auth/finalize-registration
 *
 * Called immediately after the user sets their password on /auth/setup-password.
 * Creates a minimal gyms row (onboarding_completed: false) so the onboarding
 * wizard can find it and update it with full gym data.
 *
 * Idempotent: returns 200 if the gym record already exists.
 * Requires: valid authenticated session with email_confirmed_at set.
 */
export async function POST(_req: NextRequest) {
  try {
    // ── 1. Verify the caller has a valid session ──────────────────────────────
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }

    // ── 2. Confirm email is verified ──────────────────────────────────────────
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EMAIL_NOT_CONFIRMED',
            message: 'Email address has not been confirmed yet.',
          },
        },
        { status: 403 }
      )
    }

    // ── 3. Use service role to bypass RLS ─────────────────────────────────────
    const adminClient = createAdminClient()

    // ── 4. Idempotency check: return early if gym already exists ──────────────
    const { data: existing } = await adminClient
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (existing?.id) {
      return NextResponse.json({ success: true, gymId: existing.id, alreadyExists: true })
    }

    // ── 5. Extract name stored in user metadata during sign-up ───────────────
    const fullName: string =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      ''

    // ── 6. Create minimal gym row — onboarding will fill the rest ────────────
    const TRIAL_DURATION_DAYS = parseInt(process.env.TRIAL_DURATION_DAYS ?? '14', 10)
    const now = new Date()
    const trialEndsAt = new Date(now)
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS)

    const { data: newGym, error: insertError } = await adminClient
      .from('gyms')
      .insert({
        owner_id: user.id,
        name: fullName.trim() || 'My Gym',
        onboarding_completed: false,
        subscription_status: 'trial',
        plan_type: 'trial',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !newGym) {
      // Handle race-condition duplicate (unique constraint on owner_id)
      if (insertError?.code === '23505') {
        const { data: race } = await adminClient
          .from('gyms')
          .select('id')
          .eq('owner_id', user.id)
          .single()
        return NextResponse.json({ success: true, gymId: race?.id, alreadyExists: true })
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: insertError?.message ?? 'Failed to create gym record',
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, gymId: newGym.id })
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 }
    )
  }
}
