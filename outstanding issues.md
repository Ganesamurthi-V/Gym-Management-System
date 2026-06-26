# GymFlow — Outstanding Issues After Remediation
**Date:** June 26, 2026
**Branch:** `speed`
**Scope:** Issues remaining after cross-checking `audit_report.md` against `AUDIT_REMEDIATION.md` and the actual codebase

---

## Summary

Most of the remediation work checks out — the critical `getAllTimePayments` auth gate, DAL adoption, `ShellGuard` typing, cache logging cleanup, `ADMIN_EMAIL` guards, and the import stub are all correctly fixed exactly as documented.

However, two real problems were found that the remediation doc does not mention:

1. A **performance regression** — the cache TTL was extended 5x, but two mutation paths still never invalidate the cache, so their staleness window grew from 60s to 300s.
2. A **functional bug** — a database migration the remediation doc claims was applied was never actually written to the schema file, silently breaking a feature.

---

## 🔴 Issue 1 — Cache Invalidation Gaps Got Worse After the TTL Extension

### What's the problem?

Fix 2.3 wired `deleteCache` calls into four mutation paths (new member via API, new member via form, membership renewal, marking a due paid). Fix 7.1 then extended the cache TTL on `members_list`, `dashboard`, and `payments_page` from 60 seconds to 300 seconds.

These two fixes were correct *individually*, but together they expose a gap: **not every code path that mutates a member or payment was covered by fix 2.3.** The ones that were missed now show stale data for up to 5 minutes instead of 1 — a 5x regression in exactly the scenario the original audit (2.3) was trying to fix.

**Affected files:**

| File | What it does | Cache impact |
|---|---|---|
| `app/members/[id]/edit/EditMemberClient.tsx` | Edits a member's name, phone, age, gender, area directly via the Supabase client | `members_list` cache never invalidated |
| `app/members/bulk-edit/BulkEditClient.tsx` | Bulk-edits name, phone, age, area, **and `pending_amount`** for multiple members | `members_list` cache never invalidated — `pending_amount` is shown on the members list, so this is visibly wrong, not just theoretical |
| `app/api/members/[id]/route.ts` (`PATCH`) | API equivalent of the edit above (name, phone, age, member_number) | Same gap, server-side |
| `app/api/payments/route.ts` (`POST`) | Inserts a new membership/payment record | `payments_page:12mo`, `payments_page:allTime`, and `dashboard` caches never invalidated |

For comparison, here's the pattern that **does** work correctly (`app/api/members/route.ts`, `POST`):

```ts
await deleteCache(cacheKeys.membersList(gym.id))
await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))
```

None of the four files above do anything like this.

### Why it matters

- A gym owner edits a member's phone number → the members list still shows the old phone number for up to 5 minutes.
- A gym owner bulk-edits pending dues → the members list shows the old `pending_amount` for up to 5 minutes, which is the exact bug 2.3 was supposed to close for the single-member case.
- A payment is recorded through the API route → the payments page and dashboard's "today's collection" figure can be stale for up to 5 minutes.

### Fix

The cleanest fix is to route all of these through the `invalidateMembersCache` server action that already exists in `app/members/actions.ts` (it already clears members, dashboard, and both payments caches in one call):

**`EditMemberClient.tsx`** — after the successful `.update()`:
```ts
const { invalidateMembersCache } = await import('../../actions')
await invalidateMembersCache(member.gym_id)
```

**`BulkEditClient.tsx`** — after the loop of updates completes:
```ts
const { invalidateMembersCache } = await import('../actions')
await invalidateMembersCache(gymId)
```

**`app/api/members/[id]/route.ts` (`PATCH`)** — after the successful update, before returning:
```ts
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

await deleteCache(cacheKeys.membersList(gym.id))
await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))
```

**`app/api/payments/route.ts` (`POST`)** — after the successful insert:
```ts
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

await deleteCache(cacheKeys.payments12mo(gym.id))
await deleteCache(cacheKeys.paymentsAll(gym.id))
await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))
```

### Recommendation

Beyond patching these four spots, consider a lint rule or code-review checklist item: *any write to `members`, `memberships`, or `inventory_sales` must be paired with a cache invalidation call.* The fact that this gap exists even after a dedicated remediation pass for the same class of bug suggests the underlying pattern (manually remembering to invalidate at every call site) doesn't scale — a database trigger, webhook, or wrapping all writes in a single mutation helper would remove the need to get this right by hand each time.

---

## 🟠 Issue 2 — `support_tickets` "Clear" Feature Is Silently Broken (Functional, Not Just Performance)

### What's the problem?

The remediation doc (fix 3.4) says: a new RLS `UPDATE` policy ("Migration 17") was added for `support_tickets`, and on the strength of that, the service-role client in `app/api/support/clear/route.ts` was removed in favor of the regular authenticated Supabase client.

The code change is real — `support/clear/route.ts` now uses the standard client. **But the migration was never actually added to `supabase-schema.sql`.** Checking the schema file directly:

```sql
-- support_tickets RLS policies that actually exist:
CREATE POLICY "Gym owners can view their support tickets" ON support_tickets FOR SELECT ...
CREATE POLICY "Gym owners can insert support tickets" ON support_tickets FOR INSERT ...
-- No UPDATE policy exists.
```

There's also a pre-existing, unrelated "[Migration 17]" block already in the schema (it enables Realtime publication for `admin_messages`/`support_tickets`) — it looks like this name collision is how the new policy got lost during the edit.

### Why it matters

Postgres RLS defaults to **DENY** for any operation with no matching policy. Since there's no `UPDATE` policy on `support_tickets`, and the route no longer uses the service-role client that used to bypass RLS, every `.update({ is_cleared_by_owner: true })` call against `support_tickets` in that route will now silently affect **zero rows** — no error is thrown, the endpoint returns `{ success: true }`, but nothing actually happens. The "clear all resolved tickets" and "clear single ticket" features are broken for support tickets specifically (the `admin_messages` clear path is fine, since that policy does exist).

### Fix

Add the missing policy to `supabase-schema.sql`, near the existing `support_tickets` policies:

```sql
CREATE POLICY "Gym owners can update their support tickets"
  ON support_tickets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));
```

Then run this directly against the live Supabase database (SQL Editor), since schema file changes don't auto-deploy:

```sql
CREATE POLICY "Gym owners can update their support tickets"
  ON support_tickets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));
```

After applying it, manually verify by clearing a resolved support ticket in the UI and confirming `is_cleared_by_owner` actually flips in the database.

---

## 🟢 Issue 3 — Duplicate Index Definition (Hygiene, No Functional Impact)

### What's the problem?

`idx_gyms_id_owner` is defined twice in `supabase-schema.sql` — once near the top of the file (where the original indexes live) and again near the bottom under a "[Migration 18]" comment block, which appears to have been appended without checking whether the index already existed.

```sql
-- Near top of file:
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);

-- ...hundreds of lines later, under "[Migration 18]":
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);
```

### Why it matters

`IF NOT EXISTS` makes this harmless at runtime — the second statement is a no-op. But it's the exact same "schema file maintained by hand-appending, not proper migrations" smell that the original audit flagged (and the remediation fixed) for the duplicate `attendance` RLS line. It signals the same root cause is still present and will likely produce more duplicates over time.

### Fix

Remove the duplicate block at the bottom of the file:

```sql
-- ================================================
-- [Migration 18] Add covering index for RLS subquery performance
-- ================================================
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);
```

Going forward, treat `supabase-schema.sql` as the source of truth and grep for an existing `CREATE INDEX`/`CREATE POLICY` name before appending a new migration block with the same target.

---

## What Was Verified as Correctly Fixed (No Action Needed)

For completeness, everything below was checked against the actual code and matches the remediation doc's claims:

| # | Issue | Verified |
|---|---|---|
| 2.1 | `getAllTimePayments` auth gate before cache lookup | ✅ Correct |
| 2.2 | `AccountMenu` auth-state re-fetch guard | ✅ Correct |
| 3.1 / 3.6 | DAL adoption in `account/`, `inventory/[id]`, `members/bulk-edit` pages | ✅ Correct |
| 3.2 | `GET /api/members/[id]` `gym_id` filter | ✅ Correct |
| 3.3 | Duplicate `attendance` RLS line removed | ✅ Correct |
| 3.5 | `ShellGuard` props typed (no more `any`) | ✅ Correct |
| 3.7 | `invalidateInventoryCache`/`invalidateInventoryItemCache` ownership check | ✅ Correct |
| 3.8 | Health endpoint returns error code only, not raw object | ✅ Correct |
| 4.1 | DAL `getGym()` includes `onboarding_data` | ✅ Correct |
| 4.2 | Members page: redundant `.order('name')` removed, `localeCompare` secondary sort added | ✅ Correct |
| 4.3 | `ShellGuard` `useEffect` split, `pathname` removed from interval-setup dependency array | ✅ Correct |
| 4.4 | `cacheWrapper` console logs gated behind `NODE_ENV`, `globalCacheStats` removed | ✅ Correct |
| 6.2 | `_reports_archived/` moved out of `app/` | ✅ Correct |
| 6.3 | `/api/import` stub returns `501` instead of fake `200` | ✅ Correct |
| 7.1 | TTL extended to 300s on dashboard, members, payments pages | ✅ Correct |
| 7.2 | `ADMIN_EMAIL` unset → `500`/redirect with clear log, not silent `403` | ✅ Correct |

---

## Recommended Fix Order

1. **Issue 2** (support_tickets RLS) — broken feature, fix this week.
2. **Issue 1** (cache invalidation gaps) — visible staleness bug, fix this week.
3. **Issue 3** (duplicate index) — cosmetic, backlog.