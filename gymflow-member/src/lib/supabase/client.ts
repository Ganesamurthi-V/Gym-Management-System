import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getSupabaseEnv } from './env'

let browserClient: SupabaseClient<Database> | null = null

export function createClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const { url, anonKey } = getSupabaseEnv()
    browserClient = createBrowserClient<Database>(url, anonKey)
    browserClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') browserClient = null
    })
  }

  return browserClient
}
