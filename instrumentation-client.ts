// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  // Issue 1 fix: DSN moved to environment variable — never commit credentials to source.
  // Add NEXT_PUBLIC_SENTRY_DSN to Vercel env vars and rotate the key in Sentry → Project Settings → Client Keys.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Issue 7 fix: 10% sampling in production avoids quota exhaustion and reduces per-request overhead (~5-15ms).
  // 100% sampling retained in development for full visibility.
  tracesSampleRate: isProd ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Reduced replay sampling in production (5%) to control Sentry quota.
  // Error-triggered replays remain at 100% — most valuable for debugging.
  replaysSessionSampleRate: isProd ? 0.05 : 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Issue 2 fix: sendDefaultPii REMOVED (was `true`).
  // This prevents automatic capture of IPs, cookies, and request bodies which may contain
  // gym member PII (names, phones). Required for DPDPA 2023 compliance in India.
  beforeSend(event) {
    // Explicitly strip any request body or cookies that may contain member PII
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
