import 'server-only'

/**
 * lib/supabase/env.ts
 * ───────────────────
 * Single source of truth for Supabase connection details on the SERVER.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 * Server code used to read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_
 * ANON_KEY`. Any variable prefixed `NEXT_PUBLIC_` is inlined by Next.js into the
 * client bundle, so the Supabase project hostname and anon key shipped to every
 * browser — visible in the JS bundle and in the DevTools Network tab.
 *
 * These helpers read the private `SUPABASE_URL` / `SUPABASE_ANON_KEY` instead.
 * They are `server-only`, so importing them from a client component is a build
 * error rather than a silent credential leak.
 */

/** Supabase project URL. */
export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL
  if (!url) {
    throw new Error(
      'SUPABASE_URL is not set. Add it to .env.local and to the Vercel environment.',
    )
  }
  return url
}

/** Supabase anon (public) key — safe for RLS-protected access from the server. */
export function getSupabaseAnonKey(): string {
  const key = process.env.SUPABASE_ANON_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_ANON_KEY is not set. Add it to .env.local and to the Vercel environment.',
    )
  }
  return key
}

/**
 * Supabase service-role key — bypasses RLS entirely.
 */
export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')
  }
  return key
}
