import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, adminServerError } from '@/lib/api/adminAuth'

export const dynamic = 'force-dynamic'

const ROUTE = 'POST /api/gyms/reset-password'

/**
 * Validates password strength server-side.
 * Mirrors the criteria enforced on the client setup-password page.
 */
function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (password.length > 128) return 'Password must be at most 128 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter'
  if (!/\d/.test(password)) return 'Password must contain at least one digit'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character'
  return null
}

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
