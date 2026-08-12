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
 *
 * ─── Transitional fallback ──────────────────────────────────────────────────
 * During the migration each getter falls back to the legacy `NEXT_PUBLIC_`
 * variable if the private one is not yet set. That keeps existing deployments
 * (and Vercel Preview environments where the new vars may not be configured
 * yet) working instead of hard-failing at runtime. The fallback is removed in
 * Phase 6, once the browser client is gone and the new vars are set everywhere.
 */

/** Supabase project URL. Prefers the private var; falls back to the legacy one. */
export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error(
      'SUPABASE_URL is not set. Add it to .env.local and to the Vercel environment.',
    )
  }
  return url
}

/** Supabase anon (public) key — safe for RLS-protected access from the server. */
export function getSupabaseAnonKey(): string {
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_ANON_KEY is not set. Add it to .env.local and to the Vercel environment.',
    )
  }
  return key
}

/**
 * Supabase service-role key — bypasses RLS entirely.
 * No fallback: this must never have had a NEXT_PUBLIC_ variant.
 */
export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')
  }
  return key
}
