import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { roleFromClaims, homeForRole } from '@/lib/auth/roles'

/**
 * Entry point for app.gymflow.sbs.
 *
 * The middleware already resolves `/` to the correct role home, so this
 * normally never renders. It is kept as a defence-in-depth fallback for any
 * request that bypasses the middleware matcher, and it must agree with the
 * middleware exactly — both read the role from the same verified JWT claim via
 * `roleFromClaims()`.
 */
export default async function Home() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims?.sub) redirect('/auth/login')

  redirect(homeForRole(roleFromClaims(data.claims)))
}
