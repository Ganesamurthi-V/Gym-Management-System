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

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid userId' }, { status: 400 })
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid password' }, { status: 400 })
    }

    // Server-side password strength enforcement
    const strengthError = validatePasswordStrength(password)
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 422 })
    }

    const supabase = createAdminClient()

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
