// Plain-English help text for every alert. Edit this file to change wording; no logic lives here except the lookup.
// Rule: only mention places and settings that really exist (AWS Console, GitHub Actions, Cloudflare dashboard, Better Stack,
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

const AWS_LOGS = 'AWS Console (Mumbai, ap-south-1) > CloudWatch > Log groups > the WebServer function: look for errors in the last 15 minutes.'
const AWS_DEPLOYS = 'GitHub > Actions > aws-deploy: did the latest run finish green (not red)?'
const AWS_STATUS = 'Open health.aws.amazon.com and look for an incident in Asia Pacific (Mumbai).'
const SUPABASE_STATUS = 'Open status.supabase.com: is the database having an incident?'
const CF_STATUS = 'Open www.cloudflarestatus.com for a Cloudflare incident.'
const DOMAINS = 'AWS Console > CloudFront > the GymFlow distribution: is its status Deployed and app.gymflow.sbs listed under alternate domain names?'
const ROLLBACK = 'If it started after a deploy: GitHub > Actions > open the last good aws-deploy run > Re-run all jobs.'
const REDEPLOY = 'If everything looks fine, run the aws-deploy workflow again from GitHub > Actions.'
const OPEN_IN_BROWSER = 'Open the page in your phone browser to see what a visitor sees.'

/** Variants shared by every probe that hits the app on AWS. `impact` is one sentence about what users feel. */
function appVariants(impact: string): Entry['variants'] {
  return {
    notfound: {
      happening: 'The address answered "not found" (404). That usually means the wrong or no deployment is serving this domain.',
      check: [AWS_DEPLOYS, DOMAINS, 'Was the page or route renamed or removed in the last deploy?'],
      fix: [ROLLBACK, 'Fix the domain mapping in CloudFront if it shows an error.', REDEPLOY],
    },
    server: {
      happening: 'The app answered with a server error (5xx). Something inside the app is crashing.',
      failing: impact,
      check: [AWS_LOGS, AWS_DEPLOYS, SUPABASE_STATUS, AWS_STATUS],
      fix: [ROLLBACK, 'If Supabase has an incident, wait for it to recover; nothing to change on our side.', REDEPLOY],
    },
    timeout: {
      happening: 'The app did not answer within 8 seconds. AWS or Cloudflare may have an incident, or the server function is hanging (a cold start alone takes only a few seconds).',
      failing: impact,
      check: [AWS_STATUS, CF_STATUS, SUPABASE_STATUS, AWS_LOGS + ' Search for "timeout".'],
      fix: ['If a status page shows an incident, wait; it usually clears by itself.', ROLLBACK, REDEPLOY],
    },
    network: {
      happening: 'The Worker could not connect to the address at all (DNS, certificate or network problem).',
      failing: impact,
      check: [OPEN_IN_BROWSER, DOMAINS, 'Cloudflare dashboard > your domain > DNS (if gymflow.sbs DNS is managed there): is the record still present?', AWS_STATUS],
      fix: ['Restore the missing DNS record or domain mapping.', 'If the domain expired, renew it at your registrar.'],
    },
  }
}

const HEALTH_SECRET_VARIANTS: Entry['variants'] = {
  auth: {
    happening: 'The app refused the Worker\'s password for the health check (401). The two copies of HEALTH_CHECK_SECRET are different.',
    failing: 'The deep checks are not running, so database or WhatsApp problems would go unnoticed.',
    check: ['In the infra folder run `npx sst secret list --stage production`: is HEALTH_CHECK_SECRET set?', 'Was it changed or rotated recently?'],
    fix: ['Set the Worker to the same value: run `npx wrangler secret put HEALTH_CHECK_SECRET` in the monitoring-worker folder.', 'Or run `npx sst secret set HEALTH_CHECK_SECRET <value> --stage production` in the infra folder, then run aws-deploy so both match.'],
  },
  config: {
    happening: 'The Worker has no HEALTH_CHECK_SECRET, so it cannot call this check.',
    failing: 'The deep checks are not running at all.',
    check: ['Did the Worker secrets get deleted or the Worker get recreated?'],
    fix: ['Run `npx wrangler secret put HEALTH_CHECK_SECRET` and paste the same value as the SST secret.'],
  },
}

const GUARD_VARIANTS: Entry['variants'] = {
  open: {
    happening: 'URGENT, security related: this page answered a visitor who is not logged in. It should have refused with 401.',
    failing: 'Gym data may be reachable without login. Treat as an emergency.',
    check: [AWS_DEPLOYS + ' Did something deploy just before this?', AWS_LOGS],
    fix: [ROLLBACK + ' Do this first, investigate after.', 'Then ask the developer to check the login guard (withAuth) on this route.'],
  },
  server: {
    happening: 'The login guard crashed (server error) instead of refusing with 401. A guard is broken.',
    failing: 'Logged-in users may also be failing on this part of the app.',
    check: [AWS_LOGS, AWS_DEPLOYS, SUPABASE_STATUS],
    fix: [ROLLBACK, REDEPLOY],
  },
}

const GUIDES: Record<string, Entry> = {
  'www-site': {
    label: 'Marketing website',
    happening: 'The public website www.gymflow.sbs is not loading correctly.',
    failing: 'New visitors cannot see GymFlow. The app itself may still work.',
    check: [OPEN_IN_BROWSER, 'Cloudflare dashboard > Workers & Pages > gymflow-landing-page > Deployments: latest deploy fine?', CF_STATUS],
    fix: ['Redeploy the landing page (deploy from the landing-page folder) or roll back in Cloudflare.', 'If DNS changed, restore the www record in Cloudflare > DNS.'],
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
    check: [OPEN_IN_BROWSER, AWS_DEPLOYS, AWS_STATUS],
    fix: [ROLLBACK, REDEPLOY],
    variants: appVariants('Gym owners and members cannot sign in or open the app.'),
  },
  'api-health': {
    label: 'App health check',
    happening: 'The app\'s basic health check is not reporting "healthy".',
    failing: 'The app server is down or unhealthy, so most screens will fail.',
    check: [AWS_LOGS, AWS_DEPLOYS, AWS_STATUS],
    fix: [ROLLBACK, REDEPLOY],
    variants: {
      ...appVariants('The app server is down or unhealthy, so most screens will fail.'),
      keyword: {
        happening: 'The health check answered, but not with "healthy". Open it in a browser to read the message.',
        check: ['Open app.gymflow.sbs/api/health in your phone browser.', AWS_LOGS],
        fix: [ROLLBACK, REDEPLOY],
      },
    },
  },
  'api-health-deep': {
    label: 'Deep health check',
    happening: 'The deep health check (database, login service, cache, WhatsApp queue) is reporting a problem.',
    failing: 'One of the things the app depends on is unhealthy. Users may see errors or slow screens.',
    check: [AWS_LOGS, SUPABASE_STATUS, 'Better Stack dashboard: any other monitor red at the same time?'],
    fix: ['Open the deep health URL with the secret header (developer) to see which check is red, then fix that service.', ROLLBACK],
    variants: {
      ...appVariants('The deep checks are not running, so database or WhatsApp problems would go unnoticed.'),
      ...HEALTH_SECRET_VARIANTS,
      server: {
        happening: 'The app answered 503/5xx. Either a critical dependency is unhealthy, or HEALTH_CHECK_SECRET is not set in the app ("unconfigured").',
        failing: 'A critical part of the app (such as the database) is down, or the deep check is switched off.',
        check: [SUPABASE_STATUS, AWS_LOGS, 'infra folder: `npx sst secret list --stage production` shows HEALTH_CHECK_SECRET?'],
        fix: ['If the secret is missing, run `npx sst secret set HEALTH_CHECK_SECRET <value> --stage production` (same value as the Worker), then run aws-deploy.', 'Otherwise wait for the failing service to recover, or roll back.'],
      },
    },
  },
  'api-watchdog': {
    label: 'App watchdog',
    happening: 'The app\'s watchdog (it checks background jobs and queues and sends its own alerts) could not be reached or answered badly.',
    failing: 'Stuck background work, such as WhatsApp reminders, may go unnoticed.',
    check: [AWS_LOGS, AWS_DEPLOYS, 'Better Stack dashboard: are the cron heartbeats still arriving?'],
    fix: [ROLLBACK, REDEPLOY],
    variants: {
      ...appVariants('Stuck background work, such as WhatsApp reminders, may go unnoticed.'),
      ...HEALTH_SECRET_VARIANTS,
      server: {
        happening: 'The watchdog answered 503/5xx. It may be crashing, or HEALTH_CHECK_SECRET is not set in the app ("unconfigured").',
        failing: 'Stuck background work may go unnoticed.',
        check: [AWS_LOGS, 'infra folder: `npx sst secret list --stage production` shows HEALTH_CHECK_SECRET?', SUPABASE_STATUS],
        fix: ['If the secret is missing, run `npx sst secret set HEALTH_CHECK_SECRET <value> --stage production` (same value as the Worker), then run aws-deploy.', ROLLBACK],
      },
      keyword: {
        happening: 'The watchdog answered, but not with data the Worker understands (an error page instead of JSON).',
        check: [AWS_LOGS, AWS_DEPLOYS],
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
    check: [DOMAINS + ' (look for graph.gymflow.sbs)', AWS_LOGS, 'Open metastatus.com for a WhatsApp / Meta incident.'],
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
    check: ['Try the same email and password on app.gymflow.sbs in your browser.', 'Is the app login page alert also firing?', AWS_LOGS],
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
        check: [AWS_LOGS, 'Was login or session handling changed in the latest deploy?'],
        fix: [ROLLBACK, 'Confirm CANARY_EMAIL is an owner account, not a member account.'],
      },
    },
  },
  'canary:read': {
    label: 'Test account data read (canary)',
    happening: 'The test owner logged in but could not load its data (expiring memberships).',
    failing: 'Logged-in owners may see empty or broken screens.',
    check: [AWS_LOGS, 'Admin app: does the canary gym have an active subscription (the paywall blocks inactive gyms)?', SUPABASE_STATUS],
    fix: [ROLLBACK, 'Renew or activate the canary gym subscription if that is the cause.'],
    variants: {
      ...appVariants('Logged-in owners may see broken screens.'),
      auth: {
        happening: 'The app did not accept the session cookie right after login (401/403).',
        failing: 'Real owners may be logged out immediately or blocked.',
        check: [AWS_LOGS, 'Was login, cookie or session code changed in the latest deploy?'],
        fix: [ROLLBACK, REDEPLOY],
      },
    },
  },
  'canary:logout': {
    label: 'Test logout (canary)',
    happening: 'The test account could not log out cleanly.',
    failing: 'Minor. The test session simply stays open until it expires.',
    check: [AWS_LOGS],
    fix: ['No urgent action. If it persists, ask the developer to check /api/auth/signout.'],
    variants: appVariants('Minor: only the test session is affected.'),
  },
}

function guardEntry(label: string, what: string): Entry {
  return {
    label,
    happening: `The login guard in front of ${what} is not behaving: a visitor without a login should get 401.`,
    failing: `Access to ${what} is not being protected or served correctly.`,
    check: [AWS_LOGS, AWS_DEPLOYS],
    fix: [ROLLBACK, REDEPLOY],
    variants: { ...appVariants(`Owners may be unable to open ${what}.`), ...GUARD_VARIANTS },
  }
}

const FALLBACK: Entry = {
  label: 'Check',
  happening: 'A monitored address is not responding as expected.',
  failing: 'Part of GymFlow may be unavailable.',
  check: [AWS_LOGS, AWS_STATUS],
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
