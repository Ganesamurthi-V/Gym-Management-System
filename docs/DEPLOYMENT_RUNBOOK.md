# GymFlow API Gateway Migration — Deployment Runbook

> Steps that require dashboard/infrastructure access and cannot be executed from code alone.
> Complete these **after** merging the `feat/api-gateway-migration` branch.

---

## 1. Vercel Environment Variables

In the Vercel project settings → Environment Variables, add these for **Production**, **Preview**, and **Development**:

| Variable | Value | Environments |
|----------|-------|-------------|
| `SUPABASE_URL` | `https://lrzacwfypnsnjqyhidpn.supabase.co` | Production, Preview, Development |
| `SUPABASE_ANON_KEY` | *(the anon key from Supabase dashboard)* | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | *(already set — verify it exists)* | Production, Preview, Development |
| `GRAPH_PROXY_SECRET` | *(generate: `openssl rand -hex 32`)* | Production, Preview, Development |

**Remove** (after verifying the deploy works):

| Variable | Reason |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | No longer read by any code |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No longer read by any code |

> **Order of operations:** Add the new vars first, deploy, verify, then remove the old ones.
> Preview deployments will start failing if you remove `NEXT_PUBLIC_*` before adding the private equivalents.

---

## 2. Verify After First Deploy

After the first production deploy from this branch:

1. Open Chrome DevTools → Network tab
2. Navigate to `/owner/dashboard`, `/owner/members`, `/owner/payments`
3. **Confirm:** zero requests to `*.supabase.co`
4. **Confirm:** all data requests go to same-origin `/api/*` paths
5. Sign out and sign in — verify the flow completes via `/api/auth/login`
6. Open `/auth/setup-password` from a fresh signup email — verify token exchange works

---

## 3. Cloudflare DNS (if using api.gymflow.sbs)

The current implementation uses the **same origin** (`app.gymflow.sbs`) for both the frontend and API. No DNS changes are needed unless you decide to serve the API from a separate hostname.

If you later want `api.gymflow.sbs`:
1. Add a CNAME record: `api` → `cname.vercel-dns.com`
2. Add the domain in Vercel project settings
3. Update `NEXT_PUBLIC_API_URL` to `https://api.gymflow.sbs`
4. The `lib/api/client.ts` resolver will detect the cross-origin and use the absolute URL

---

## 4. Cloudflare WAF / Rate Limiting (optional hardening)

These are defence-in-depth layers. The app already has server-side rate limiting via Upstash Redis. Add these if you want edge-level protection:

**Rate limit rules:**
- `/api/auth/login` — 10 req/min per IP (matches the server-side Upstash limit)
- `/api/auth/signup` — 5 req/min per IP
- `/api/auth/resend` — 3 req/min per IP
- `/api/*` (catch-all) — 120 req/min per IP

**WAF rules:**
- Block requests to `/api/*` with `Origin` header not matching `app.gymflow.sbs` or `localhost:*`
- Block requests with `User-Agent` containing common scanner strings

**Bot protection:**
- Enable Cloudflare Bot Management or Super Bot Fight Mode for the `/api/auth/*` paths

---

## 5. Supabase Dashboard

No changes needed to:
- Database schema
- RLS policies
- Auth settings

The server-side client uses the same cookie-based session and the same RLS policies as before.

**One optional cleanup:** In Supabase → Auth → URL Configuration:
- The "Redirect URLs" list may still contain entries that reference the old flow. These are harmless but can be pruned for clarity.

---

## 6. Remove `NEXT_PUBLIC_SUPABASE_*` from `.env.local`

After confirming the deploy works, remove these lines from your local `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

They are no longer read by any code. Keeping them is harmless but confusing.

---

## 7. Future: Eliminate the Last `https://*.supabase.co` CSP Exception

The CSP `connect-src` no longer includes `*.supabase.co`. However, if you ever re-add it (e.g. for a new feature), the proper fix for the `setup-password` fragment exchange is:

1. Change `emailRedirectTo` in `/api/auth/signup` and `/api/auth/resend` to point at a server-side callback route (e.g. `/api/auth/callback?code=...`)
2. In Supabase → Auth → Email Templates, switch from "Magic Link" style (fragment) to "PKCE" style (query param `code`)
3. The callback route calls `exchangeCodeForSession(code)` server-side
4. Remove the client-side hash parsing from `setup-password`

This is tracked as a follow-up — not required for the migration to be complete, since the fragment exchange now goes through our own `/api/auth/set-session` endpoint anyway.

---

## Summary Checklist

- [ ] Add `SUPABASE_URL` + `SUPABASE_ANON_KEY` to Vercel (all environments)
- [ ] Verify `SUPABASE_SERVICE_ROLE_KEY` exists in Vercel
- [ ] Add `GRAPH_PROXY_SECRET` to Vercel (all environments)
- [ ] Deploy `feat/api-gateway-migration` branch
- [ ] Verify: Network tab shows zero `*.supabase.co` requests
- [ ] Verify: Login/signup/password-setup flows work end-to-end
- [ ] Verify: Multi-gym isolation (Gym A cannot see Gym B data)
- [ ] Remove `NEXT_PUBLIC_SUPABASE_URL` from Vercel
- [ ] Remove `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Vercel
- [ ] Remove `NEXT_PUBLIC_SUPABASE_*` from local `.env.local`
- [ ] (Optional) Add Cloudflare rate-limit rules
