// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  // Issue A fix: DSN moved to environment variable (was hardcoded — same bug as instrumentation-client.ts).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Issue A fix: 10% sampling in production.
  // Edge middleware runs on every protected route request — 100% tracing is extremely costly.
  tracesSampleRate: isProd ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Issue A fix: sendDefaultPii REMOVED (was `true`).
  // The edge middleware handles auth cookies and inspects session tokens — the most sensitive
  // data in the request lifecycle. All three fields must be stripped for DPDPA 2023 compliance.
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies; // Edge middleware reads auth cookies — must not forward to Sentry
      delete event.request.headers; // Carries Authorization + Supabase session tokens
    }
    return event;
  },
});
