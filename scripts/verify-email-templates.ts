/**
 * scripts/verify-email-templates.ts
 * ─────────────────────────────────
 * Guards the Supabase auth email templates. Each one is checked against the
 * strategy its landing target actually supports, because the correct answer is
 * the OPPOSITE for owners and members.
 *
 * ─── TWO STRATEGIES, BOTH CORRECT IN THEIR OWN PLACE ────────────────────────
 *
 * 'fragment-token'  (OWNER: confirm signup, reset password)
 *   Links point at a client PAGE with the token in the URL fragment:
 *       {{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=...
 *   A fragment is never transmitted in an HTTP request, so a mail scanner or
 *   link prefetcher that fetches the page URL consumes nothing. The page redeems
 *   the token only after a real click.
 *   ConfirmationURL is FORBIDDEN here: it points at Supabase's hosted verify
 *   endpoint, which consumes the one-time token on any GET. Since TokenHash is
 *   the hashed form of that same token, including both means whichever is
 *   fetched first kills the other.
 *
 * 'confirmation-url'  (MEMBER: magic link)
 *   `emailRedirectTo` is /api/activate/callback — a SERVER route, which cannot
 *   read a fragment. The flow relies on Supabase's implicit redirect carrying
 *   #access_token=... to /activate/verifying, which reads window.location.hash.
 *   ConfirmationURL is REQUIRED here, and a fragment token_hash would be wrong:
 *   app/activate/verifying/page.tsx has no token_hash handling, so such a link
 *   would hit its `no_tokens` branch and activation would fail.
 *   The single-use problem is mitigated in the product instead — that page
 *   detects otp_expired, re-checks activation status, and offers a resend.
 *
 * Run with:  npm run verify:email-templates
 */

import { existsSync, readFileSync } from 'node:fs'

const TOKEN_HASH = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4'
const OWNER_REDIRECT = 'https://app.gymflow.sbs/auth/setup-password'
const MEMBER_REDIRECT = 'https://app.gymflow.sbs/api/activate/callback'
const RAW_TOKEN_MARKER = 'RAWTOKENMARKER'

type Strategy = 'fragment-token' | 'confirmation-url'

type Target = {
  file: string
  dashboard: string
  audience: 'OWNER' | 'MEMBER'
  strategy: Strategy
  /** Only meaningful for fragment-token templates. */
  expectedType?: string
  redirect: string
  note?: string
}

const TARGETS: Target[] = [
  {
    file: 'supabase/templates/confirmation.html',
    dashboard: 'Confirm signup',
    audience: 'OWNER',
    strategy: 'fragment-token',
    expectedType: 'email',
    redirect: OWNER_REDIRECT,
  },
  {
    file: 'supabase/templates/recovery.html',
    dashboard: 'Reset password',
    audience: 'OWNER',
    strategy: 'fragment-token',
    expectedType: 'recovery',
    redirect: OWNER_REDIRECT,
  },
  {
    file: 'supabase/templates/magic-link.html',
    dashboard: 'Magic Link',
    audience: 'MEMBER',
    strategy: 'confirmation-url',
    redirect: MEMBER_REDIRECT,
    note: 'ConfirmationURL is required — /api/activate/callback cannot read a fragment.',
  },
  {
    file: 'supabase/templates/invite.html',
    dashboard: 'Invite user',
    audience: 'MEMBER',
    strategy: 'fragment-token',
    expectedType: 'invite',
    redirect: OWNER_REDIRECT,
    note: 'Dormant: nothing calls inviteUserByEmail.',
  },
]

function render(source: string, redirect: string): string {
  const confirmationUrl =
    `https://project.supabase.co/auth/v1/verify?token=${RAW_TOKEN_MARKER}&type=signup&redirect_to=${redirect}`

  return source.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_m, name: string) => {
    switch (name) {
      case 'TokenHash':
        return TOKEN_HASH
      case 'RedirectTo':
        return redirect
      case 'ConfirmationURL':
        return confirmationUrl
      case 'SiteURL':
        return 'https://app.gymflow.sbs'
      case 'Email':
        return 'person@example.com'
      case 'Token':
        return '123456'
      default:
        return `<<UNKNOWN:${name}>>`
    }
  })
}

type Check = { name: string; ok: boolean; detail: string }

/**
 * Strips HTML comments.
 *
 * Value-leak checks deliberately scan the FULL rendered output, because Go
 * templating evaluates actions inside comments — writing a variable there really
 * would emit its value into the email. Structural link checks are the opposite:
 * a comment cannot create a link, and the explanatory notes in these files quote
 * example URLs, so scanning them produces false positives.
 */
function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

function tokenOccurrences(output: string): number[] {
  const positions: number[] = []
  let idx = output.indexOf(TOKEN_HASH)
  while (idx !== -1) {
    positions.push(idx)
    idx = output.indexOf(TOKEN_HASH, idx + 1)
  }
  return positions
}

function inspect(target: Target): Check[] {
  const source = readFileSync(target.file, 'utf8')
  const output = render(source, target.redirect)
  const checks: Check[] = []

  // Value leaks are checked against the full output; link structure against the
  // comment-free output. See stripComments().
  const markup = stripComments(output)
  const usesConfirmationUrl = output.includes(RAW_TOKEN_MARKER)
  const positions = tokenOccurrences(markup)

  if (target.strategy === 'fragment-token') {
    checks.push({
      name: 'ConfirmationURL never rendered (would be consumable)',
      ok: !usesConfirmationUrl,
      detail: usesConfirmationUrl ? 'FOUND — token would be consumable' : 'absent',
    })

    const allInFragment = positions.every(pos => {
      const lineStart = markup.lastIndexOf('\n', pos) + 1
      return markup.slice(lineStart, pos).includes('#')
    })
    checks.push({
      name: 'token appears only inside a URL fragment',
      ok: positions.length > 0 && allInFragment,
      detail: `${positions.length} occurrence(s), all after '#': ${allInFragment}`,
    })

    checks.push({
      name: `declares type=${target.expectedType}`,
      ok: markup.includes(`type=${target.expectedType}`),
      detail: markup.includes(`type=${target.expectedType}`) ? 'yes' : 'MISSING',
    })

    checks.push({
      name: 'primary link points at our own page',
      ok: markup.includes(`${target.redirect}#token_hash=`),
      detail: markup.includes(`${target.redirect}#token_hash=`) ? 'yes' : 'MISSING',
    })
  } else {
    checks.push({
      name: 'uses ConfirmationURL (required by the server-route callback)',
      ok: usesConfirmationUrl,
      detail: usesConfirmationUrl ? 'yes' : 'MISSING — activation would break',
    })

    checks.push({
      name: 'no fragment token_hash link (verifying page cannot redeem one)',
      ok: !markup.includes('#token_hash='),
      detail: markup.includes('#token_hash=')
        ? 'FOUND — would land as no_tokens'
        : 'absent',
    })
  }

  const leftovers = output.match(/\{\{[^}]*\}\}|<<UNKNOWN:\w+>>/g) ?? []
  checks.push({
    name: 'no unsubstituted or unknown template variables',
    ok: leftovers.length === 0,
    detail: leftovers.length === 0 ? 'none' : leftovers.join(', '),
  })

  return checks
}

function main(): void {
  const rule = '─'.repeat(76)
  let failures = 0

  console.log(`\n${'═'.repeat(76)}`)
  console.log('  Supabase Auth Email Template Verification')
  console.log('═'.repeat(76))

  for (const target of TARGETS) {
    console.log(`\n  ${target.file}`)
    console.log(
      `    Dashboard: ${target.dashboard}  |  Audience: ${target.audience}  |  Strategy: ${target.strategy}`,
    )
    if (target.note) console.log(`    Note: ${target.note}`)

    if (!existsSync(target.file)) {
      failures += 1
      console.log('    [FAIL] file is missing')
      continue
    }

    for (const check of inspect(target)) {
      if (!check.ok) failures += 1
      console.log(`    [${check.ok ? 'PASS' : 'FAIL'}] ${check.name} — ${check.detail}`)
    }
  }

  console.log(`\n${rule}`)
  if (failures === 0) {
    console.log('  Passed: every template matches the strategy its landing target supports.')
    console.log(`${'═'.repeat(76)}\n`)
    return
  }
  console.log(`  ${failures} check(s) FAILED.`)
  console.log(`${'═'.repeat(76)}\n`)
  process.exit(1)
}

main()
