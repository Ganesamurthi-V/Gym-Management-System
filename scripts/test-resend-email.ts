/**
 * scripts/test-resend-email.ts
 * ────────────────────────────
 * Sends every GymFlow Resend template to a real inbox so you can eyeball the
 * rendered result end to end. This exercises the SAME published templates and
 * variable keys the app uses at runtime (see lib/email/resend.ts).
 *
 * It sends REAL email. Run it manually, never as part of the test suite.
 *
 * Usage:
 *   npx tsx scripts/test-resend-email.ts
 *   npx tsx scripts/test-resend-email.ts you@example.com   # override recipient
 *
 * Requires in .env.local:
 *   RESEND_API_KEY   — from https://resend.com/api-keys
 *   RESEND_FROM      — an address on a Resend-verified domain
 *   RESEND_LOGO_URL  — optional; falls back to each template's own default
 */

import { Resend } from 'resend'
import * as dotenv from 'dotenv'

// ─── Load .env.local (same vars the app uses) ────────────────────────────────
// Loaded at import time via a static import — this script is transformed to CJS
// by tsx, which does not allow top-level await.
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

// ─── Config ───────────────────────────────────────────────────────────────
const DEFAULT_RECIPIENT = 'fosecovetri530@gmail.com'
const recipient = process.argv[2]?.trim() || DEFAULT_RECIPIENT

/** Published template aliases — must match lib/email/resend.ts EMAIL_TEMPLATES. */
const TEMPLATES = {
  setPassword: 'gymflow-set-password',
  confirmEmail: 'gymflow-confirm-email',
  deleteAccountOtp: 'gymflow-delete-account-otp',
} as const

const year = String(new Date().getFullYear())

// A sample link that mirrors the real fragment shape the app builds.
const sampleActionUrl =
  (process.env.NEXT_PUBLIC_APP_URL || 'https://app.gymflow.sbs') +
  '/auth/setup-password#token_hash=SAMPLE_TOKEN_FOR_PREVIEW_ONLY&type=signup'

interface SendCase {
  label: string
  alias: string
  subject: string
  variables: Record<string, string>
}

const cases: SendCase[] = [
  {
    label: 'Set Password (owner signup)',
    alias: TEMPLATES.setPassword,
    subject: '[TEST] Set your GymFlow password',
    // No logo_url — the template's own fallback (landscape lockup) applies.
    variables: { action_url: sampleActionUrl, year },
  },
  {
    label: 'Confirm Email (member activation)',
    alias: TEMPLATES.confirmEmail,
    subject: '[TEST] Confirm your email for GymFlow Members',
    // No logo_url — the template's own fallback (members mark) applies.
    variables: { action_url: sampleActionUrl, year },
  },
  {
    label: 'Delete Account OTP',
    alias: TEMPLATES.deleteAccountOtp,
    subject: '[TEST] Your GymFlow account deletion code',
    // No logo_url — the template's own fallback (landscape lockup) applies.
    variables: { otp_code: '318650', expiry_label: '60 seconds', year },
  },
]

async function main() {
  console.log('\n' + '═'.repeat(70))
  console.log('  GymFlow — Resend Template Send Test')
  console.log('═'.repeat(70))

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM

  if (!apiKey) {
    console.error('\n❌  RESEND_API_KEY is not set in .env.local. Aborting.')
    process.exit(1)
  }
  if (!from) {
    console.error('\n❌  RESEND_FROM is not set in .env.local. Use an address on a Resend-verified domain.')
    process.exit(1)
  }

  console.log(`  From:      ${from}`)
  console.log(`  To:        ${recipient}`)
  console.log(`  Logo:      per-template fallback (owner=landscape, member=members mark)`)
  console.log('─'.repeat(70) + '\n')

  const resend = new Resend(apiKey)
  let failures = 0

  for (const c of cases) {
    process.stdout.write(`→  ${c.label} … `)
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: recipient,
        subject: c.subject,
        template: { id: c.alias, variables: c.variables },
      })

      if (error) {
        failures++
        console.log(`❌  ${error.message}`)
      } else {
        console.log(`✅  sent (id: ${data?.id ?? 'unknown'})`)
      }
    } catch (err) {
      failures++
      console.log(`❌  ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('\n' + '─'.repeat(70))
  if (failures === 0) {
    console.log(`✨  All ${cases.length} emails sent. Check ${recipient} (and spam).`)
  } else {
    console.log(`⚠️  ${failures} of ${cases.length} sends failed. See errors above.`)
  }
  console.log('─'.repeat(70) + '\n')

  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
