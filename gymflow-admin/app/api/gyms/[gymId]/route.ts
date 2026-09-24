import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

// GET /api/gyms/[gymId] — gym detail with owner info
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gymId: string }> }
) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { gymId } = await params
  const supabase = createAdminClient()

  const gymRes = await supabase
    .from('gyms')
    // phone and onboarding_data added for the same reason as the /gyms/[gymId] page: the
    // gym's contact number was not being selected, so no admin surface could show it.
    .select('id, name, owner_id, created_at, is_active, phone, onboarding_data')
    .eq('id', gymId)
    .single()

  if (gymRes.error || !gymRes.data) {
    return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
  }

  const gym = gymRes.data

  const { data: { user: owner } } = await supabase.auth.admin.getUserById(gym.owner_id)

  /*
    Resolved here rather than left to each client, so the web page and the admin mobile app
    cannot disagree about where a gym's phone comes from. Column first, then the JSONB it
    lived in exclusively before the column started being written — gyms onboarded before
    that change have a number only in the blob.
  */
  const onboarding = (gym.onboarding_data ?? {}) as Record<string, unknown>
  const onboardingPhone = typeof onboarding.phone === 'string' ? onboarding.phone.trim() : ''
  const phone = gym.phone?.trim() || onboardingPhone || null

  return NextResponse.json({
    gym: { ...gym, phone },
    owner: owner ? {
      email: owner.email,
      phone: owner.user_metadata?.mobile_number || owner.phone || null,
      created_at: owner.created_at,
      last_sign_in_at: owner.last_sign_in_at,
      email_confirmed_at: owner.email_confirmed_at,
    } : null,
  })
}
