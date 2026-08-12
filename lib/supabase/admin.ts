import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with the Service Role Key.
 * 
 * WARNING: This client bypasses Row Level Security (RLS) entirely.
 * It must ONLY be used in secure Server Actions or Server Components
 * where you have explicitly verified the user is a platform super-admin.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Ensure it is set in .env.local')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
