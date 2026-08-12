import { createClient } from '@supabase/supabase-js'

/**
 * Supabase admin client using the SERVICE ROLE key.
 * This bypasses all RLS policies — use ONLY in server-side code.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env variables')
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
