import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { Database } from '@/types/database'
import { getSupabaseEnv } from './env'

/**
 * Request-scoped Supabase server client.
 *
 * Wrapped in React `cache()` so the client is constructed **once per request**
 * and reused by every data helper. Previously each helper in `member-data.ts`
 * called `createClient()` itself, which meant 3-4 clients (and 3-4 `cookies()`
 * reads plus 3-4 internal auth-state initialisations) per page render.
 *
 * `cache()` is per-request in the App Router, so there is no cross-request or
 * cross-user leakage: two concurrent users each get their own client bound to
 * their own cookie jar.
 */
export const getServerClient = cache(async () => {
  const cookieStore = await cookies()
  const { url, anonKey } = getSupabaseEnv()

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot write cookies; middleware refreshes them.
        }
      },
    },
  })
})

/**
 * Backwards-compatible alias.
 *
 * Existing route handlers import `createClient`. It now returns the shared
 * per-request instance instead of building a new one.
 */
export const createClient = getServerClient
