import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, adminServerError } from '@/lib/api/adminAuth'
import { validatePasswordStrength } from '@/lib/auth/password'

export const dynamic = 'force-dynamic'

const ROUTE = 'POST /api/gyms/reset-password'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ROUTE)
  if (!auth.ok) return auth.response

  try {
    let body: { userId?: string; password?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { userId, password } = body

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!userId || typeof userId !== 'string' || !UUID_RE.test(userId)) {
      return NextResponse.json({ error: 'Missing or invalid userId' }, { status: 400 })
    }

    if (!password || typeof password !== 'string' || password.length > 128) {
      return NextResponse.json({ error: 'Missing or invalid password' }, { status: 400 })
    }

    // Server-side password strength enforcement
    const strengthError = validatePasswordStrength(password)
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 422 })
    }

    const supabase = createAdminClient()

    // Only gym OWNER accounts may be reset here; any other auth user id (members,
    // the platform admin, other staff) is refused.
    const { data: ownedGym, error: gymError } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle()
    if (gymError) throw gymError
    if (!ownedGym) {
      return NextResponse.json({ error: 'User is not a gym owner' }, { status: 403 })
    }

    const { error } = await supabase.auth.admin.updateUserById(
      userId,
      { password }
    )

    if (error) throw error

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err: unknown) {
    return adminServerError(ROUTE, err)
  }
}
