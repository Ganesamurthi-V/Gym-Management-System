/**
 * Email Configuration — Verification Email Integration Test
 *
 * Sends a real Supabase Auth signup verification email to the target address,
 * mirroring exactly what the create-account page does:
 *
 *   supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
 *
 * followed by a resend via:
 *
 *   supabase.auth.admin.generateLink({ type: 'signup', email })
 *
 * Run with:
 *   npx vitest run __tests__/email/verification-email.test.ts
 *
 * Prerequisites:
 *   .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *   The Supabase project's email provider must be configured (SMTP or Supabase's
 *   built-in email). Check Authentication → Email templates in the Supabase dashboard.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// ─── Load .env.local (same vars the Next.js app uses) ──────────────────────
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

// ─── Config ────────────────────────────────────────────────────────────────

/** The email address to send the test verification to. */
const TARGET_EMAIL = 'gxnzhhh@gmail.com'

/**
 * Redirect URL baked into the verification link — same value as the app.
 * In production this is process.env.NEXT_PUBLIC_APP_URL + '/auth/setup-password'.
 */
const EMAIL_REDIRECT_TO =
  (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000') +
  '/auth/setup-password'

// ─── Supabase clients ────────────────────────────────────────────────────────

function makeAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing env vars. Make sure NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY are set in .env.local',
    )
  }

  return createAdminSupabase(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function makeAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'Missing env vars. Make sure NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local',
    )
  }

  return createAdminSupabase(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Clean up any existing unconfirmed user with TARGET_EMAIL so the signUp
 * call doesn't hit the "already registered" guard. This matches the signup
 * path of the app which shows a friendly error on conflict.
 */
async function cleanupExistingUser(
  adminClient: ReturnType<typeof makeAdminClient>,
): Promise<void> {
  // list users that match the email (admin API, service role required)
  const { data } = await adminClient.auth.admin.listUsers()
  const existing = data?.users?.find((u) => u.email === TARGET_EMAIL)
  if (existing) {
    console.log(
      `  ↳ Found existing user (id=${existing.id}, confirmed=${!!existing.email_confirmed_at}). Deleting for clean test…`,
    )
    const { error } = await adminClient.auth.admin.deleteUser(existing.id)
    if (error) {
      console.warn(`  ⚠ Could not delete existing user: ${error.message}`)
    }
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Email config — verification email delivery', () => {
  let adminClient: ReturnType<typeof makeAdminClient>
  let anonClient: ReturnType<typeof makeAnonClient>

  beforeAll(() => {
    adminClient = makeAdminClient()
    anonClient = makeAnonClient()
  })

  // ── Test 1: Initial signup (same code path as CreateAccountPage) ──────────

  it(
    'sends a signup verification email to the target address',
    async () => {
      console.log(`\n📧  Sending signup verification email to: ${TARGET_EMAIL}`)
      console.log(`    Redirect URL: ${EMAIL_REDIRECT_TO}`)

      // Clean up so the signup isn't rejected as "already registered"
      await cleanupExistingUser(adminClient)

      // ── Same call used in app/auth/create-account/page.tsx ──
      // Using the anon client will trigger the actual email dispatch!
      const { data, error } = await anonClient.auth.signUp({
        email: TARGET_EMAIL,
        password: crypto.randomUUID(), // Needs a password to sign up
        options: {
          data: {
            full_name: 'Test User',
            name: 'Test User',
            mobile_number: '9999999999',
          },
          emailRedirectTo: EMAIL_REDIRECT_TO,
        },
      })

      if (error) {
        console.error('  ✗ signUp error:', error.message)
      }

      expect(error).toBeNull()
      expect(data.user).toBeTruthy()
      expect(data.user?.email).toBe(TARGET_EMAIL)

      console.log(`  ✓ User signed up (id=${data.user?.id})`)
      console.log(
        `  ✓ Email should be delivered to ${TARGET_EMAIL} shortly.`,
      )
      console.log(
        `    Check inbox (and spam) for a "Confirm your email" message from Supabase.`,
      )
    },
    60_000, // 60 s timeout for network round-trips
  )

  // ── Test 2: Resend (same code path as EmailSentScreen.handleResend) ────────

  it(
    'resends the verification email (mirrors supabase.auth.resend call)',
    async () => {
      console.log(`\n🔄  Resending verification email to: ${TARGET_EMAIL}`)

      // Ensure a fresh unconfirmed user exists to resend to
      const { data: existingData } = await adminClient.auth.admin.listUsers()
      const existingUser = existingData?.users?.find(
        (u) => u.email === TARGET_EMAIL && !u.email_confirmed_at,
      )

      if (!existingUser) {
        // Create one if not present from the previous test
        await cleanupExistingUser(adminClient)
        await adminClient.auth.admin.createUser({
          email: TARGET_EMAIL,
          email_confirm: false,
          user_metadata: { full_name: 'Test User', name: 'Test User' },
        })
      }

      // ── Same call used in EmailSentScreen (create-account/page.tsx) ──
      // The browser client calls supabase.auth.resend({ type: 'signup', email, options })
      // This will dispatch the email again.
      const { data: resendData, error: resendError } =
        await anonClient.auth.resend({
          type: 'signup',
          email: TARGET_EMAIL,
          options: {
            emailRedirectTo: EMAIL_REDIRECT_TO,
          },
        })

      if (resendError) {
        console.error('  ✗ Resend error:', resendError.message)
      }

      expect(resendError).toBeNull()

      console.log(`  ✓ Resend email dispatched successfully`)
      console.log(`    Check inbox for a second verification email.`)
    },
    60_000,
  )

  // ── Test 3: Validate Supabase email config is reachable ───────────────────

  it('validates Supabase project is reachable and auth is operational', async () => {
    console.log(`\n🔍  Validating Supabase project connectivity…`)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    console.log(`    Project URL: ${supabaseUrl}`)

    // List users — if the service role key is wrong this will throw 401
    const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1 })

    if (error) {
      console.error('  ✗ Auth admin API error:', error.message)
    }

    expect(error).toBeNull()
    expect(Array.isArray(data?.users)).toBe(true)

    console.log(`  ✓ Supabase auth admin API is reachable`)
    console.log(`    Total users in project: ${data?.users?.length ?? 0}`)
  })

  // ── Teardown hint ─────────────────────────────────────────────────────────

  it('cleanup — removes the test user created during this run', async () => {
    console.log(`\n🧹  Cleaning up test user…`)

    const { data } = await adminClient.auth.admin.listUsers()
    const testUser = data?.users?.find((u) => u.email === TARGET_EMAIL)

    if (!testUser) {
      console.log('  ↳ No test user found — already cleaned up.')
      return
    }

    const { error } = await adminClient.auth.admin.deleteUser(testUser.id)
    expect(error).toBeNull()

    console.log(`  ✓ Test user deleted (id=${testUser.id})`)
  })
})
