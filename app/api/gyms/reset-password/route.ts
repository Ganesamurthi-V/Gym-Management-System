import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.split(' ')[1]
    const validPassword = process.env.ADMIN_PASSWORD

    if (!token || token !== validPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase.auth.admin.updateUserById(
      userId,
      { password }
    )

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
