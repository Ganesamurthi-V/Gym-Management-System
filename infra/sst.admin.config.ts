/// <reference path="./.sst/platform/config.d.ts" />

// Separate SST app (run with `--config sst.admin.config.ts`) so the main app's deploys never depend
// on admin secrets or the admin certificate.

// Server-only values. Each becomes `sst secret set <Name> --config sst.admin.config.ts`.
const SECRET_NAMES = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PANEL_SECRET', 'ADMIN_JWT_SECRET',
  'SENTRY_AUTH_TOKEN', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'AI_API_KEY',
  'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'CRON_SECRET',
] as const

// Non-secret config and NEXT_PUBLIC_* values (inlined at build time), read from the deploy shell.
const PLAIN_ENV_NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_ADMIN_URL', 'ADMIN_SESSION_VERSION',
  'SENTRY_ORG', 'SENTRY_PROJECT', 'SUPPORT_EMAIL_ADDRESS', 'SUPPORT_EMAIL_FROM_NAME',
  'SUPPORT_EMAIL_LOGO_URL', 'AI_BASE_URL', 'AI_MODELS', 'AI_TPM_BUDGET', 'AI_TPD_BUDGET',
  'AI_DAILY_LIMIT', 'LOG_LEVEL', 'FIREBASE_PROJECT_ID',
] as const

export default $config({
  app(input) {
    return {
      name: 'gymflow-admin',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      home: 'aws',
      providers: { aws: { region: 'ap-south-1' } },
    }
  },
  async run() {
    // CloudFront only accepts ACM certificates from us-east-1, and the ARN is account-specific, so it
    // comes from the shell instead of being committed.
    const cert = process.env.ADMIN_CERT_ARN
    if (!cert) {
      throw new Error(
        'ADMIN_CERT_ARN is not set. Request an ACM certificate for admin.gymflow.sbs in us-east-1, ' +
          'validate it, then export its ARN as ADMIN_CERT_ARN before running sst.',
      )
    }

    const environment: Record<string, $util.Input<string>> = {}
    for (const n of SECRET_NAMES) environment[n] = new sst.Secret(n).value
    // Skip empty values: an exported-but-blank variable must not reach the app as an empty string.
    for (const n of PLAIN_ENV_NAMES) if (process.env[n]) environment[n] = process.env[n]!

    new sst.aws.Nextjs('Admin', {
      path: '../gymflow-admin',
      // Pinned release that accepts Next 16.4.x (the default OpenNext rejects it).
      openNextVersion: '4.1.13',
      // DNS stays outside AWS: CNAME admin -> the CloudFront domain after the first deploy.
      domain: { name: 'admin.gymflow.sbs', cert, dns: false },
      environment,
      server: { timeout: '60 seconds', memory: '1024 MB', architecture: 'x86_64' },
    })
  },
})
