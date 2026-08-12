/**
 * Supabase environment accessors for the member app.
 *
 * Uses private vars (no NEXT_PUBLIC_ prefix) so the Supabase project URL
 * and anon key never appear in the browser bundle.
 */
export function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'SUPABASE_URL or SUPABASE_ANON_KEY not set. Add them to .env.local.',
    )
  }

  return { url, anonKey }
}
