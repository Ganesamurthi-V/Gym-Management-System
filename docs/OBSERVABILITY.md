# GymFlow — Observability Guide

Every request in both apps now carries a **unique `x-request-id`** that flows from
the edge middleware through every route handler, into Sentry, and back to the browser.

---

## What gets logged

Every request emits structured JSON lines to stdout (captured by Vercel / any log drain).

### Entry log (DEBUG)
```json
{ "requestId": "a3f2c19e0b4d", "context": "MEMBERS_API_GET", "level": "DEBUG",
  "message": "→ MEMBERS_API_GET START", "timestamp": "..." }
```

### Summary log (INFO or WARN)
Emitted at the end of every request. Tagged `WARN` if `totalMs > 3000`.
```json
{
  "requestId": "a3f2c19e0b4d",
  "context": "MEMBERS_API_GET",
  "method": "GET",
  "path": "/api/members",
  "statusCode": 200,
  "userId": "uuid-of-user",
  "gymId": "uuid-of-gym",
  "cacheHit": true,
  "timings": [
    { "name": "AUTH",      "durationMs": 12 },
    { "name": "GET_GYM",   "durationMs": 3  },
    { "name": "DB_QUERY",  "durationMs": 45 }
  ],
  "authMs": 12,
  "dbMs": 45,
  "redisMs": 0,
  "totalMs": 68,
  "payloadKb": 4.2,
  "level": "INFO",
  "timestamp": "2026-07-03T10:22:31.000Z"
}
```

### Error log (ERROR)
```json
{
  "requestId": "a3f2c19e0b4d",
  "context": "MEMBERS_API_POST",
  "level": "ERROR",
  "message": "duplicate key value violates unique constraint",
  "errorName": "PostgrestError",
  "method": "POST",
  "path": "/api/members",
  "userId": "uuid",
  "gymId": "uuid",
  "contextMessage": "DB insert failed",
  "timestamp": "..."
}
```

---

## How to find a problem

### 1. User reports an error
Ask them to open browser DevTools → Network tab → find the failing request →
copy the **`x-request-id` response header** (e.g. `a3f2c19e0b4d`).

Then search logs:
```
requestId: a3f2c19e0b4d
```
You'll see every step that request took — auth, DB query, cache — and exactly
where it failed.

### 2. Find all slow requests
```
level: WARN
```
or filter on `totalMs` > 3000.

### 3. Find all errors on a specific route
```
context: PAYMENTS_API_POST   level: ERROR
```

### 4. Cross-reference with Sentry
Every `log.error()` call also sends the exception to Sentry with `request_id` as
a custom tag. In Sentry → Issues → search `request_id:a3f2c19e0b4d` to find the
full stack trace for any error you see in logs.

### 5. Admin panel actions
Admin routes also log `adminAction` (e.g. `ban_gym`, `resolve_ticket`). Filter:
```
app: gymflow-admin   adminAction: ban_gym
```

---

## Adding logging to a new route

```typescript
import { apiLogger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const log = apiLogger('MY_ROUTE', req)
  // log.requestId is now available — return it in meta if useful

  try {
    log.start('AUTH')
    const user = await getUser()
    log.end('AUTH')
    log.userId = user.id

    log.start('DB_INSERT')
    const data = await db.insert(...)
    log.end('DB_INSERT')

    log.summary(201)
    return NextResponse.json({ data, meta: { request_id: log.requestId } })
  } catch (err) {
    log.error('Insert failed', err)   // → logs + Sentry
    log.summary(500)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

For a Server Component (no request object):
```typescript
import { logger } from '@/lib/logger'

export default async function MyPage() {
  const log = logger('MY_PAGE')
  log.start('DATA_FETCH')
  const data = await fetchData()
  log.end('DATA_FETCH')
  log.summary()
  ...
}
```

---

## Log levels

| Level | When emitted |
|-------|-------------|
| `DEBUG` | Entry log + `.step()` calls. Hidden in production unless `LOG_LEVEL=debug` |
| `INFO` | `.summary()` when `totalMs ≤ 3000`, `.info()` calls |
| `WARN` | `.summary()` when `totalMs > 3000`, `.warn()` calls |
| `ERROR` | `.error()` calls — also sent to Sentry |
| `METRICS` | Summary line prefix (always emitted, easy to filter separately) |

---

## Environment variables

No extra config required — uses existing Sentry DSN (`NEXT_PUBLIC_SENTRY_DSN`).

Optional:
```env
LOG_LEVEL=debug    # Emit DEBUG lines in production (useful for short debugging sessions)
```

---

## Files changed / created

| File | What it does |
|------|-------------|
| `lib/logger.ts` | Core `RequestLogger` class — structured logs + Sentry integration |
| `middleware.ts` | Stamps `x-request-id` on every request, propagates to response |
| `app/api/members/route.ts` | Full logging wired in |
| `app/api/attendance/route.ts` | Full logging wired in |
| `app/api/payments/route.ts` | Full logging wired in |
| `gymflow-admin/lib/logger.ts` | Admin panel logger (same pattern, no Sentry dep) |
| `gymflow-admin/middleware.ts` | Stamps `x-request-id` on every admin request |
| `gymflow-admin/app/api/gyms/reset-password/route.ts` | Full logging wired in |
| `gymflow-admin/app/api/gyms/toggle-active/route.ts` | Full logging wired in |
| `gymflow-admin/app/api/support/route.ts` | Full logging wired in |
| `gymflow-admin/app/api/support/tickets/route.ts` | Full logging wired in |
