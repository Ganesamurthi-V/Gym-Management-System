/// <reference path="./.sst/platform/config.d.ts" />

// Server-only values from .env.example. Each becomes `sst secret set <Name>`.
const SECRET_NAMES = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RESEND_API_KEY',
  'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN',
  'GRAPH_PROXY_SECRET', 'QSTASH_TOKEN', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY',
  'VAPID_PRIVATE_KEY', 'SENTRY_WEBHOOK_SECRET', 'HEALTH_CHECK_SECRET',
  'BETTERSTACK_HEARTBEAT_WHATSAPP', 'BETTERSTACK_HEARTBEAT_SUBSCRIPTION',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
  // Biometric receiver: the ingest secret, plus the device-facing host/port kept as secrets so the
  // VPS address never lands in repo variables or the browser bundle.
  'ADMS_INGEST_SECRET', 'ADMS_PUBLIC_HOST', 'ADMS_PUBLIC_PORT',
] as const

// Non-secret config and NEXT_PUBLIC_* values (inlined into the browser bundle at build time,
// so they are read from the deploy shell, never from SST secrets).
const PLAIN_ENV_NAMES = [
  'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'NEXT_PUBLIC_SENTRY_DSN',
  'TRIAL_DURATION_DAYS', 'RESEND_FROM', 'WHATSAPP_API_VERSION', 'WHATSAPP_BASE_URL',
  'GRAPH_API_BASE_URL', 'QSTASH_URL', 'VAPID_SUBJECT', 'PUSH_EVENING_ENABLED', 'ALERT_MAX_PER_HOUR',
] as const

// Same schedules as vercel.json, in UTC. push-evening is omitted on purpose: its route documents
// a QStash schedule (~19:00 IST), not an AWS one.
const CRONS = [
  { name: 'Whatsapp', path: '/api/cron/whatsapp', schedule: 'cron(30 3 * * ? *)' },
  { name: 'Subscription', path: '/api/cron/subscription', schedule: 'cron(0 0 * * ? *)' },
]

export default $config({
  app(input) {
    return {
      name: 'gymflow',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      home: 'aws',
      providers: { aws: { region: 'ap-south-1' } },
    }
  },
  async run() {
    const secrets = Object.fromEntries(SECRET_NAMES.map((n) => [n, new sst.Secret(n)]))
    const environment: Record<string, $util.Input<string>> = {}
    for (const n of SECRET_NAMES) environment[n] = secrets[n].value
    for (const n of PLAIN_ENV_NAMES) if (process.env[n] !== undefined) environment[n] = process.env[n]!

    const web = new sst.aws.Nextjs('Web', {
      path: '..',
      // The default OpenNext release rejects Next 15.5.28. 4.x is the first release that accepts it.
      openNextVersion: '4.1.13',
      // One distribution serves every host the middleware routes by hostname. The certificate was
      // requested by hand in us-east-1 (CloudFront needs it there), and DNS stays outside AWS until cutover.
      // Only the production stage owns the domain: another stage (for example a streaming test) would
      // otherwise claim the same aliases and fail, and with a domain set CloudFront answers 403 on its own
      // *.cloudfront.net host, so a domain-less test stage is also the one you can open by its CloudFront URL.
      domain:
        $app.stage === 'production'
          ? {
              name: 'app.gymflow.sbs',
              aliases: ['gymflow.sbs', 'graph.gymflow.sbs', 'member.gymflow.sbs'],
              cert: 'arn:aws:acm:us-east-1:296214943025:certificate/2b7e1129-ecab-4808-ab28-f1b4bd57e887',
              dns: false,
            }
          : undefined,
      // Keeps 3 server Lambdas warm: SST's ssr-warmer invokes them every 5 minutes (about 26,000 invocations
      // a month, a few hundred GB-seconds, inside the Lambda free tier). Together with the streaming wrapper
      // in open-next.config.ts this makes a cold start rare, and cheap when it happens. It is not provisioned
      // concurrency (billed), so a visitor after a long quiet spell can still hit one.
      warm: 3,
      environment,
      // SST also applies this timeout as the CloudFront origin read timeout, so no transform is needed.
      server: { timeout: '60 seconds', memory: '1024 MB', architecture: 'x86_64' },
    })

    // Disabled until cutover: Vercel crons still own the daily runs, and both firing would
    // double-run WhatsApp automation.
    for (const c of CRONS) {
      new sst.aws.Cron(`Cron${c.name}`, {
        schedule: c.schedule as `cron(${string})`,
        enabled: false,
        job: {
          handler: 'cron/handler.handler',
          runtime: 'nodejs22.x',
          timeout: '60 seconds',
          environment: { APP_URL: web.url, CRON_PATH: c.path, CRON_SECRET: secrets.CRON_SECRET.value },
        },
      })
    }
  },
})
