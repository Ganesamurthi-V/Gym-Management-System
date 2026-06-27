// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  // Issue A fix: DSN moved to environment variable (was hardcoded — same bug as instrumentation-client.ts).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Issue A fix: 10% sampling in production. Server handles every API route — 100% tracing
  // adds measurable overhead (~5-15ms) per request and exhausts Sentry quota rapidly.
  tracesSampleRate: isProd ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Issue A fix: sendDefaultPii REMOVED (was `true`).
  // Server-side is the highest-risk surface — request bodies contain member names, phone numbers,
  // and payment amounts. Headers carry Authorization tokens and Supabase session cookies.
  // Stripping all three (data, cookies, headers) is required for DPDPA 2023 compliance.
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.headers; // Server-only: strips Authorization + session tokens
    }
    return event;
  },
});
