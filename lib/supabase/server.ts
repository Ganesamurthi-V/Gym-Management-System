import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

/**
 * Request-scoped Supabase server client.
 *
 * Wrapped in React `cache()` so the client is built **once per request** and
 * shared by every caller. Previously each DAL helper and each page called
 * `createClient()` itself, so a single navigation constructed 4-6 clients, each
 * re-reading `cookies()` and re-initialising Supabase's internal auth state.
 *
 * `cache()` is per-request in the App Router, so there is no cross-request or
 * cross-user leakage — two concurrent users each get a client bound to their
 * own cookie jar.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not set.')
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component — safe to ignore
        }
      },
    },
  })
})

/**
 * Alias used by the migrated member-app code.
 *
 * The standalone member PWA named this helper `getServerClient`. Exporting the
 * same request-scoped instance under both names means there is still exactly
 * ONE client per request shared by owner and member code — importing from two
 * different names would otherwise be easy to mistake for two separate clients.
 */
export const getServerClient = createClient
