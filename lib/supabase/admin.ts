import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseUrl, getSupabaseServiceRoleKey } from './env'

/**
 * Creates a Supabase client with the Service Role Key.
 * 
 * WARNING: This client bypasses Row Level Security (RLS) entirely.
 * It must ONLY be used in secure Server Actions or Server Components
 * where you have explicitly verified the user is a platform super-admin.
 */
export function createAdminClient() {
  const supabaseUrl = getSupabaseUrl()
  const supabaseServiceKey = getSupabaseServiceRoleKey()

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
