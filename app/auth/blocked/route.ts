import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, getGymCore } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { OWNER_HOME } from '@/lib/protected-routes'

export const dynamic = 'force-dynamic'

/**
 * GET /auth/blocked
 *
 * Landing point of the server access gate for a deactivated gym (is_active = false). A plain
 * redirect to /auth/login?error=blocked would be bounced back to the dashboard by middleware
 * (a signed-in owner may not sit on /auth/*), so the session is ended here first.
 *
 * It signs out ONLY after re-reading the caller's own gym row, so following this URL by hand
 * (or a forged link) can never log out an active owner: they are sent back to the console.
 */
export async function GET(req: NextRequest) {
  const { user } = await getAuthUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))

  const { gym } = await getGymCore(user.id)
  if (!gym || gym.is_active !== false) return NextResponse.redirect(new URL(OWNER_HOME, req.url))

  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' }).catch(() => {})

  return NextResponse.redirect(new URL('/auth/login?error=blocked', req.url), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
