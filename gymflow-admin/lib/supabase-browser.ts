import { createClient } from '@supabase/supabase-js'

/**
 * Browser-side Supabase client for the admin panel.
 *
 * Used exclusively for Supabase Realtime subscriptions (broadcast + postgres_changes).
 * This uses the ANON key — same key that gym owners use — which is safe to expose
 * client-side. RLS policies still apply, and the admin panel only uses this for
 * receiving realtime events (not for data mutations).
 *
 * Data mutations continue to go through API routes that use the service role key.
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
