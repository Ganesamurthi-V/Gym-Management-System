/**
 * scripts/verify-email-templates.ts
 * ─────────────────────────────────
 * Guards the Supabase auth email templates. Every one of them must put the
 * one-time token in the URL FRAGMENT of a link to a page we control:
 *
 *     {{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=...
 *
 * A fragment is never transmitted in an HTTP request, so a mail scanner, link
 * prefetcher or antivirus product that fetches the URL receives an ordinary page
 * and consumes nothing. The landing page redeems the token only after a real
 * click.
 *
 * ─── ConfirmationURL IS FORBIDDEN IN ALL OF THEM ────────────────────────────
 * It resolves to Supabase's hosted /auth/v1/verify endpoint, which redeems the
 * one-time token on ANY GET. And because TokenHash is the hashed form of that
 * same token, a template containing both is worse than either alone: whichever
 * is fetched first invalidates the other.
 *
 * ─── THE MEMBER MAGIC LINK USED TO BE THE EXCEPTION ─────────────────────────
 * It was required to use ConfirmationURL, because `emailRedirectTo` pointed at
 * /api/activate/callback — a SERVER route, which cannot read a fragment. That is
 * why members reported activation links "expiring" within seconds: scanners were
 * redeeming them in transit.
 *
 * That exception is gone. `emailRedirectTo` now points at /activate/verifying, a
 * client page that holds the token unredeemed until tapped, so the magic link is
 * verified by exactly the same rules as the owner templates. /api/activate/
 * callback is still deployed for links already sitting in inboxes.
 *
 * Run with:  npm run verify:email-templates
 */

import { existsSync, readFileSync } from 'node:fs'

const TOKEN_HASH = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4'
const OWNER_REDIRECT = 'https://app.gymflow.sbs/auth/setup-password'
const MEMBER_REDIRECT = 'https://app.gymflow.sbs/activate/verifying'
const RAW_TOKEN_MARKER = 'RAWTOKENMARKER'

type Target = {
  file: string
  dashboard: string
  audience: 'OWNER' | 'MEMBER'
  /** The `type=` parameter the landing page expects to redeem with. */
  expectedType: string
  redirect: string
  note?: string
}

const TARGETS: Target[] = [
  {
    file: 'supabase/templates/confirmation.html',
    dashboard: 'Confirm signup',
    audience: 'OWNER',
    expectedType: 'email',
    redirect: OWNER_REDIRECT,
  },
  {
    file: 'supabase/templates/recovery.html',
    dashboard: 'Reset password',
    audience: 'OWNER',
    expectedType: 'recovery',
    redirect: OWNER_REDIRECT,
  },
  {
    file: 'supabase/templates/magic-link.html',
    dashboard: 'Magic Link',
    audience: 'MEMBER',
    expectedType: 'magiclink',
    redirect: MEMBER_REDIRECT,
    note: 'Redeemed by /activate/verifying via POST /api/activate/redeem.',
  },
  {
    file: 'supabase/templates/invite.html',
    dashboard: 'Invite user',
    audience: 'MEMBER',
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
      `    Dashboard: ${target.dashboard}  |  Audience: ${target.audience}  |  type=${target.expectedType}`,
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
    console.log('  Passed: every template keeps its one-time token in a scanner-safe fragment.')
    console.log(`${'═'.repeat(76)}\n`)
    return
  }
  console.log(`  ${failures} check(s) FAILED.`)
  console.log(`${'═'.repeat(76)}\n`)
  process.exit(1)
}

main()
