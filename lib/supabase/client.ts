import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!client) {
    const newClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    newClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') client = null
    })
    client = newClient
  }
  return client
}
