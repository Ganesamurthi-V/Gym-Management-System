import { createClient } from '@supabase/supabase-js'

/**
 * Browser-side Supabase client for the admin panel.
 *
 * Used exclusively for payload-free Supabase Realtime broadcast invalidations.
 * The admin panel uses a custom cookie session rather than Supabase Auth, so
 * this anonymous client MUST NOT consume global postgres_changes or trust
 * broadcast payloads as data. Invalidation handlers re-fetch through protected
 * admin API routes that use the service role only on the server.
 */
let browserClient: ReturnType<typeof createClient> | null = null

export function getRealtimeClient() {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Add NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local for realtime support.'
    )
  }

  browserClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  })

  return browserClient
}
