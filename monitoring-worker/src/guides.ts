// Plain-English help text for every alert. Edit this file to change wording; no logic lives here except the lookup.
// Rule: only mention places and settings that really exist (Vercel dashboard, Cloudflare dashboard, Better Stack,
// Supabase status, `npx wrangler ...`). Keep every step to one short line, written for a phone screen.

export type FailureKind = 'status' | 'timeout' | 'network' | 'keyword' | 'canary' | 'config'

export interface Failure {
  kind: FailureKind
  status?: number
}

export interface Guide {
  /** Short human name, also used in recovered messages. */
  label: string
  happening: string
  failing: string
  check: string[]
  fix: string[]
}

export type Variant = 'default' | 'notfound' | 'server' | 'auth' | 'timeout' | 'network' | 'keyword' | 'config' | 'open' | 'rate'

interface Entry extends Guide {
  variants: Partial<Record<Variant, Partial<Omit<Guide, 'label'>>>>
}

const VERCEL_LOGS = 'Vercel dashboard > your project > Logs: look for red errors in the last 15 minutes.'
const VERCEL_DEPLOYS = 'Vercel dashboard > your project > Deployments: is the newest one "Ready" (not red)?'
const VERCEL_STATUS = 'Open status.vercel.com and look for an ongoing incident.'
const SUPABASE_STATUS = 'Open status.supabase.com: is the database having an incident?'
const CF_STATUS = 'Open www.cloudflarestatus.com for a Cloudflare incident.'
const DOMAINS = 'Vercel dashboard > your project > Settings > Domains: no red warning next to the domain?'
const ROLLBACK = 'If it started after a deploy: Vercel > Deployments > open the last good one > Instant Rollback / Promote to Production.'
const REDEPLOY = 'If everything looks fine, redeploy the latest deployment from the Deployments page.'
const OPEN_IN_BROWSER = 'Open the page in your phone browser to see what a visitor sees.'

/** Variants shared by every probe that hits the Vercel app. `impact` is one sentence about what users feel. */
function appVariants(impact: string): Entry['variants'] {
  return {
    notfound: {
      happening: 'The address answered "not found" (404). That usually means the wrong or no deployment is serving this domain.',
      check: [VERCEL_DEPLOYS, DOMAINS, 'Was the page or route renamed or removed in the last deploy?'],
      fix: [ROLLBACK, 'Fix the domain mapping in Settings > Domains if it shows an error.', REDEPLOY],
    },
    server: {
      happening: 'The app answered with a server error (5xx). Something inside the app is crashing.',
      failing: impact,
      check: [VERCEL_LOGS, VERCEL_DEPLOYS, SUPABASE_STATUS, VERCEL_STATUS],
      fix: [ROLLBACK, 'If Supabase has an incident, wait for it to recover; nothing to change on our side.', REDEPLOY],
    },
    timeout: {
      happening: 'The app did not answer within 8 seconds. Vercel or Cloudflare may have an incident, or a function is hanging.',
      failing: impact,
      check: [VERCEL_STATUS, CF_STATUS, SUPABASE_STATUS, VERCEL_LOGS + ' Search for "timeout".'],
      fix: ['If a status page shows an incident, wait; it usually clears by itself.', ROLLBACK, REDEPLOY],
    },
    network: {
      happening: 'The Worker could not connect to the address at all (DNS, certificate or network problem).',
      failing: impact,
      check: [OPEN_IN_BROWSER, DOMAINS, 'Cloudflare dashboard > your domain > DNS (if gymflow.sbs DNS is managed there): is the record still present?', VERCEL_STATUS],
      fix: ['Restore the missing DNS record or domain mapping.', 'If the domain expired, renew it at your registrar.'],
    },
  }
}

const HEALTH_SECRET_VARIANTS: Entry['variants'] = {
  auth: {
    happening: 'The app refused the Worker\'s password for the health check (401). The two copies of HEALTH_CHECK_SECRET are different.',
    failing: 'The deep checks are not running, so database or WhatsApp problems would go unnoticed.',
    check: ['Vercel dashboard > your project > Settings > Environment Variables: is HEALTH_CHECK_SECRET set for Production?', 'Was it changed or rotated recently?'],
    fix: ['Set the Worker to the same value: run `npx wrangler secret put HEALTH_CHECK_SECRET` in the monitoring-worker folder.', 'Or change it in Vercel and redeploy so both match.'],
  },
  config: {
    happening: 'The Worker has no HEALTH_CHECK_SECRET, so it cannot call this check.',
    failing: 'The deep checks are not running at all.',
    check: ['Did the Worker secrets get deleted or the Worker get recreated?'],
    fix: ['Run `npx wrangler secret put HEALTH_CHECK_SECRET` and paste the same value as in Vercel.'],
  },
}

const GUARD_VARIANTS: Entry['variants'] = {
  open: {
    happening: 'URGENT, security related: this page answered a visitor who is not logged in. It should have refused with 401.',
    failing: 'Gym data may be reachable without login. Treat as an emergency.',
    check: [VERCEL_DEPLOYS + ' Did something deploy just before this?', VERCEL_LOGS],
    fix: [ROLLBACK + ' Do this first, investigate after.', 'Then ask the developer to check the login guard (withAuth) on this route.'],
  },
  server: {
    happening: 'The login guard crashed (server error) instead of refusing with 401. A guard is broken.',
    failing: 'Logged-in users may also be failing on this part of the app.',
    check: [VERCEL_LOGS, VERCEL_DEPLOYS, SUPABASE_STATUS],
    fix: [ROLLBACK, REDEPLOY],
  },
}

const GUIDES: Record<string, Entry> = {
  'www-site': {
    label: 'Marketing website',
    happening: 'The public website www.gymflow.sbs is not loading correctly.',
    failing: 'New visitors cannot see GymFlow. The app itself may still work.',
    check: [OPEN_IN_BROWSER, 'Cloudflare dashboard > Workers & Pages > gymflow-landing-page > Deployments: latest deploy fine?', CF_STATUS],
    fix: ['Redeploy the landing page (deploy from the landing-page-1 folder) or roll back in Cloudflare.', 'If DNS changed, restore the www record in Cloudflare > DNS.'],
    variants: {
      ...appVariants('New visitors cannot see GymFlow. The app itself may still work.'),
      keyword: {
        happening: 'The site loaded but it does not contain the word "GymFlow". A wrong page or a maintenance page may be showing.',
        check: [OPEN_IN_BROWSER, 'Cloudflare dashboard > Workers & Pages > gymflow-landing-page > Deployments: did a bad build go out?'],
        fix: ['Roll back to the previous deployment in Cloudflare, or redeploy the landing page.'],
      },
    },
  },
  'www-sitemap': {
    label: 'Website sitemap',
    happening: 'The sitemap file (sitemap.xml) is not available.',
    failing: 'Only search engines are affected (Google may not see new pages). No user impact.',
    check: ['Open www.gymflow.sbs/sitemap.xml in a browser.', 'Cloudflare dashboard > Workers & Pages > gymflow-landing-page > Deployments.'],
    fix: ['Redeploy the landing page so the sitemap file is included.', 'Low urgency: fix within a day or two.'],
    variants: appVariants('Only search engines are affected. Low urgency.'),
  },
  'app-login-page': {
    label: 'App login page',
    happening: 'The login page of app.gymflow.sbs is not loading.',
    failing: 'Gym owners and members cannot sign in. This is the most visible kind of outage.',
    check: [OPEN_IN_BROWSER, VERCEL_DEPLOYS, VERCEL_STATUS],
    fix: [ROLLBACK, REDEPLOY],
    variants: appVariants('Gym owners and members cannot sign in or open the app.'),
  },
  'api-health': {
    label: 'App health check',
    happening: 'The app\'s basic health check is not reporting "healthy".',
    failing: 'The app server is down or unhealthy, so most screens will fail.',
    check: [VERCEL_LOGS, VERCEL_DEPLOYS, VERCEL_STATUS],
    fix: [ROLLBACK, REDEPLOY],
    variants: {
      ...appVariants('The app server is down or unhealthy, so most screens will fail.'),
      keyword: {
        happening: 'The health check answered, but not with "healthy". Open it in a browser to read the message.',
        check: ['Open app.gymflow.sbs/api/health in your phone browser.', VERCEL_LOGS],
        fix: [ROLLBACK, REDEPLOY],
      },
    },
  },
  'api-health-deep': {
    label: 'Deep health check',
    happening: 'The deep health check (database, login service, cache, WhatsApp queue) is reporting a problem.',
    failing: 'One of the things the app depends on is unhealthy. Users may see errors or slow screens.',
    check: [VERCEL_LOGS, SUPABASE_STATUS, 'Better Stack dashboard: any other monitor red at the same time?'],
    fix: ['Open the deep health URL with the secret header (developer) to see which check is red, then fix that service.', ROLLBACK],
    variants: {
      ...appVariants('The deep checks are not running, so database or WhatsApp problems would go unnoticed.'),
      ...HEALTH_SECRET_VARIANTS,
      server: {
        happening: 'The app answered 503/5xx. Either a critical dependency is unhealthy, or HEALTH_CHECK_SECRET is not set in Vercel ("unconfigured").',
        failing: 'A critical part of the app (such as the database) is down, or the deep check is switched off.',
        check: [SUPABASE_STATUS, VERCEL_LOGS, 'Vercel > Settings > Environment Variables: is HEALTH_CHECK_SECRET set for Production?'],
        fix: ['If the secret is missing in Vercel, add it (same value as the Worker) and redeploy.', 'Otherwise wait for the failing service to recover, or roll back.'],
      },
    },
  },
  'api-watchdog': {
    label: 'App watchdog',
    happening: 'The app\'s watchdog (it checks background jobs and queues and sends its own alerts) could not be reached or answered badly.',
    failing: 'Stuck background work, such as WhatsApp reminders, may go unnoticed.',
    check: [VERCEL_LOGS, VERCEL_DEPLOYS, 'Better Stack dashboard: are the cron heartbeats still arriving?'],
    fix: [ROLLBACK, REDEPLOY],
    variants: {
      ...appVariants('Stuck background work, such as WhatsApp reminders, may go unnoticed.'),
      ...HEALTH_SECRET_VARIANTS,
      server: {
        happening: 'The watchdog answered 503/5xx. It may be crashing, or HEALTH_CHECK_SECRET is not set in Vercel ("unconfigured").',
        failing: 'Stuck background work may go unnoticed.',
        check: [VERCEL_LOGS, 'Vercel > Settings > Environment Variables: is HEALTH_CHECK_SECRET set for Production?', SUPABASE_STATUS],
        fix: ['If the secret is missing in Vercel, add it (same value as the Worker) and redeploy.', ROLLBACK],
      },
      keyword: {
        happening: 'The watchdog answered, but not with data the Worker understands (an error page instead of JSON).',
        check: [VERCEL_LOGS, VERCEL_DEPLOYS],
        fix: [ROLLBACK, REDEPLOY],
      },
    },
  },
  'guard-members': guardEntry('Members API login guard', 'the members list'),
  'guard-payments': guardEntry('Payments API login guard', 'payment records'),
  'guard-expiring': guardEntry('Expiring memberships login guard', 'the expiring memberships list'),
  'graph-proxy': {
    label: 'WhatsApp proxy',
    happening: 'graph.gymflow.sbs, the relay used to send WhatsApp messages, is not answering.',
    failing: 'WhatsApp reminders and OTP messages may fail to send. The app itself works.',
    check: [DOMAINS + ' (look for graph.gymflow.sbs)', VERCEL_LOGS, 'Open metastatus.com for a WhatsApp / Meta incident.'],
    fix: [ROLLBACK, 'Re-add the graph.gymflow.sbs domain in Settings > Domains if it is missing.', 'Queued messages are retried automatically once it is back.'],
    variants: appVariants('WhatsApp messages may fail to send. The app itself works.'),
  },
  'status-page': {
    label: 'Public status page',
    happening: 'status.gymflow.sbs, the public status page, is not reachable.',
    failing: 'Customers cannot see the status page. The app is not affected.',
    check: ['Better Stack dashboard > Status pages: is the page published?', 'Better Stack: custom domain still verified?'],
    fix: ['Re-publish the page in Better Stack.', 'Fix the status DNS record in Cloudflare > DNS if Better Stack asks for it.'],
    variants: appVariants('Customers cannot see the status page. The app is not affected.'),
  },
  'canary:login': {
    label: 'Test login (canary)',
    happening: 'The test owner account could not log in to the app.',
    failing: 'Real owners may be unable to log in too, or the test account itself is wrong.',
    check: ['Try the same email and password on app.gymflow.sbs in your browser.', 'Is the app login page alert also firing?', VERCEL_LOGS],
    fix: ['If the browser login works, update the Worker: `npx wrangler secret put CANARY_PASSWORD` (and CANARY_EMAIL).', 'If real logins fail too, follow the login page alert.'],
    variants: {
      ...appVariants('Real owners may be unable to log in.'),
      rate: {
        happening: 'The app said "too many login attempts" (429). The login limit was reached.',
        failing: 'Only the test check is blocked. Real users are not affected unless they share the same network.',
        check: ['Is anything else logging in with the canary email, or two Workers running the canary?'],
        fix: ['Wait 5 to 10 minutes; it clears by itself.', 'Make sure only one monitoring Worker has CANARY_ENABLED on.'],
      },
      auth: {
        happening: 'The app refused the test account (wrong credentials, or the account is suspended / blocked).',
        failing: 'Only the test check fails. Real users may be fine.',
        check: ['Log in with the canary email in a browser: does it work?', 'Admin app: is the canary gym active, with a valid subscription?'],
        fix: ['Reset the canary password, then run `npx wrangler secret put CANARY_PASSWORD`.', 'Re-activate the canary gym in the admin app if it was blocked.'],
      },
      default: {
        happening: 'Login looked fine but the Worker did not get a usable session (no cookie, or not an owner account).',
        failing: 'Real users may be affected if sessions are not being created.',
        check: [VERCEL_LOGS, 'Was login or session handling changed in the latest deploy?'],
        fix: [ROLLBACK, 'Confirm CANARY_EMAIL is an owner account, not a member account.'],
      },
    },
  },
  'canary:read': {
    label: 'Test account data read (canary)',
    happening: 'The test owner logged in but could not load its data (expiring memberships).',
    failing: 'Logged-in owners may see empty or broken screens.',
    check: [VERCEL_LOGS, 'Admin app: does the canary gym have an active subscription (the paywall blocks inactive gyms)?', SUPABASE_STATUS],
    fix: [ROLLBACK, 'Renew or activate the canary gym subscription if that is the cause.'],
    variants: {
      ...appVariants('Logged-in owners may see broken screens.'),
      auth: {
        happening: 'The app did not accept the session cookie right after login (401/403).',
        failing: 'Real owners may be logged out immediately or blocked.',
        check: [VERCEL_LOGS, 'Was login, cookie or session code changed in the latest deploy?'],
        fix: [ROLLBACK, REDEPLOY],
      },
    },
  },
  'canary:logout': {
    label: 'Test logout (canary)',
    happening: 'The test account could not log out cleanly.',
    failing: 'Minor. The test session simply stays open until it expires.',
    check: [VERCEL_LOGS],
    fix: ['No urgent action. If it persists, ask the developer to check /api/auth/signout.'],
    variants: appVariants('Minor: only the test session is affected.'),
  },
}

function guardEntry(label: string, what: string): Entry {
  return {
    label,
    happening: `The login guard in front of ${what} is not behaving: a visitor without a login should get 401.`,
    failing: `Access to ${what} is not being protected or served correctly.`,
    check: [VERCEL_LOGS, VERCEL_DEPLOYS],
    fix: [ROLLBACK, REDEPLOY],
    variants: { ...appVariants(`Owners may be unable to open ${what}.`), ...GUARD_VARIANTS },
  }
}

const FALLBACK: Entry = {
  label: 'Check',
  happening: 'A monitored address is not responding as expected.',
  failing: 'Part of GymFlow may be unavailable.',
  check: [VERCEL_LOGS, VERCEL_STATUS],
  fix: [ROLLBACK, REDEPLOY],
  variants: {},
}

export function variantOf(f: Failure): Variant {
  switch (f.kind) {
    case 'timeout':
      return 'timeout'
    case 'network':
      return 'network'
    case 'keyword':
      return 'keyword'
    case 'config':
      return 'config'
    case 'canary':
      if (f.status === 429) return 'rate'
      if (f.status === 401 || f.status === 403) return 'auth'
      if (f.status !== undefined && f.status >= 500) return 'server'
      return 'default'
    default: {
      const s = f.status
      if (s === 404) return 'notfound'
      if (s !== undefined && s >= 500) return 'server'
      if (s === 401 || s === 403) return 'auth'
      if (s !== undefined && s >= 200 && s < 300) return 'open'
      return 'default'
    }
  }
}

export function hasGuide(probeName: string): boolean {
  return probeName in GUIDES
}

export function getProbeGuide(probeName: string, failure: Failure): Guide {
  const e = GUIDES[probeName] ?? FALLBACK
  const v = e.variants[variantOf(failure)] ?? {}
  return {
    label: e.label,
    happening: v.happening ?? e.happening,
    failing: v.failing ?? e.failing,
    check: v.check ?? e.check,
    fix: v.fix ?? e.fix,
  }
}
