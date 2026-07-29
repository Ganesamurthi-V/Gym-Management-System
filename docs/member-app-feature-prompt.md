# Feature Prompt: Member App Management Module

## Context

This is the GymFlow Owner Portal — a Next.js 15 App Router application using:

- **Routing**: `app/` directory (all new routes go under `app/member-app/`)
- **Auth + data**: `@/lib/dal` (`getAuthUser`, `getGym`), `@/lib/supabase/server` and `/client`
- **Caching**: `cacheWrapper` from `@/lib/cache` with Redis TTL; invalidate with `invalidateMembersCache()` or equivalent
- **Logging**: `apiLogger` from `@/lib/logger` — wrap all Server Component data fetches in a `RequestLogger`
- **Design tokens**: Tailwind with `brand-{50–900}` (blue), `surface.*` neutrals, `font-sans` (Sora). No new colours or utility classes
- **UI primitives**: `bg-white rounded-2xl shadow-sm border border-surface-border p-6` for cards — match exactly what Dashboard and Members pages use
- **Navigation**: `NAV_ITEMS` array in `components/layout/NavClient.tsx` — add one entry; do **not** restructure the file
- **Icons**: Lucide React only — pick from existing imports before adding new ones
- **State**: `'use client'` components receive props from a Server Component page; keep data fetching in the Server Component
- **Types**: `types/index.ts` (core domain), `types/whatsapp.ts` (WhatsApp). New types go in `types/member-app.ts`
- **Member app being managed**: `gymflow-member/` — a separate Next.js app. The DB bridge is the `members` table column `auth_user_id` (portal identity) and `member_code`
- **WhatsApp templates already typed**: `TemplateId` union in `types/whatsapp.ts`; relevant IDs for this feature are `_gymflow_welcome_member`, `membership_renewed`, `membership_expiry_reminder`, `_birthday_wishes`

---

## Objective

Build a **Member App Management** module in the Owner Portal. This is an **operational dashboard**, not a settings page. Gym owners use it to monitor portal health, manage per-member access, track invitation and activity pipelines, and configure the member-facing app.

---

## Route & Navigation

**Route**: `app/member-app/page.tsx`

**Sidebar entry** (add to `NAV_ITEMS` in `components/layout/NavClient.tsx`, below Reports):
```ts
{ label: 'Member App', href: '/member-app', icon: SmartphoneIcon }
```
Use the existing `comingSoon` badge pattern if you need a safe placeholder initially — remove it once the page ships.

---

## File Structure

```
app/member-app/
  page.tsx           ← Server Component (auth guard + data fetch)
  loading.tsx        ← Skeleton matching layout
  MemberAppClient.tsx ← 'use client' root

features/member-app/
  components/
    OverviewCards.tsx
    MemberPortalTable.tsx
    InvitationActivity.tsx
    MemberActivityLog.tsx
    LoginOverview.tsx
    WhatsAppTemplates.tsx
    GamificationPanel.tsx
    AnalyticsCharts.tsx
    MaintenancePanel.tsx
    PortalSettings.tsx
  hooks/
    useMemberAppFilters.ts
    useMemberAppActions.ts
  services/
    memberAppService.ts   ← all mock data lives here, behind typed functions
  types/
    index.ts              ← export from types/member-app.ts alias

types/member-app.ts       ← canonical types for this module
```

> **Rule**: zero hardcoded mock data inside components. All fixtures come from `features/member-app/services/memberAppService.ts`.

---

## Page Architecture

### Server Component (`app/member-app/page.tsx`)

Follow the exact pattern used in `app/members/page.tsx`:

```ts
export default async function MemberAppPage() {
  const logger = apiLogger('MEMBER_APP')
  const { user } = await getAuthUser()
  if (!user) return null
  const { gym } = await getGym(user.id)
  if (!gym) return null

  // Wrap in cacheWrapper with a short TTL (60s) once real queries exist.
  // For the mock phase, pass props directly from the service layer.
  const data = await getMemberAppData(gym.id, logger)

  return (
    <Suspense fallback={<MemberAppSkeleton />}>
      <MemberAppClient gymId={gym.id} gymName={gym.name} initialData={data} />
    </Suspense>
  )
}
```

### Client Component (`MemberAppClient.tsx`)

- Tab-based layout (shadcn `Tabs` or a simple controlled state)
- Each section = one tab or anchor section
- Receives `initialData` as props; mutations go through server actions or Supabase client

---

## Section Specifications

### Section 1 — Overview

Six stat cards in a responsive grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6`).

| Card | Value type | Mock default |
|---|---|---|
| App Status | `'Online' \| 'Offline'` badge | Online |
| Active Members | `number` (members with `auth_user_id != null`) | 48 |
| Pending Invitations | `number` | 12 |
| Today's Logins | `number` | 9 |
| Weekly Active Users | `number` | 31 |
| Monthly Active Users | `number` | 44 |

Use the same stat card markup as `DashboardClient.tsx` (white card, label in slate-500 small text, value in slate-900 2xl font, optional trend badge).

---

### Section 2 — Member Portal Management

Server-paginated table. Columns:

```
Member Name | Portal Status | Invitation Status | Activated On | Last Login | Actions
```

**Portal Status values**: `enabled | disabled | not_invited`
**Invitation Status values**: `not_sent | pending | delivered | activated | expired`

**Row actions** (dropdown `⋯`):
- Enable Portal / Disable Portal (toggle)
- Send Invitation / Resend Invitation (context-dependent)
- Suspend Access / Reactivate (toggle)
- Reset Password
- Force Logout

**Bulk actions** (shown when ≥1 row selected via checkbox):
- Enable Portal for selected
- Send Invitation to selected
- Suspend selected
- Export selected

Type for a row:
```ts
export interface MemberPortalRow {
  memberId: string
  memberName: string
  memberNumber: number
  phone: string
  portalStatus: 'enabled' | 'disabled' | 'not_invited'
  invitationStatus: 'not_sent' | 'pending' | 'delivered' | 'activated' | 'expired'
  activatedOn: string | null   // ISO date
  lastLogin: string | null     // ISO datetime
}
```

---

### Section 3 — Invitation Activity

Filterable table. Columns:

```
Member | Invitation Sent On | Status | Activated On | Actions
```

**Status badge colours**:
- `pending` → amber
- `delivered` → blue
- `activated` → green
- `expired` → red

Filters:
- Text search (member name)
- Status filter (multi-select chip row)
- Date range (sent on — from/to, use `<input type="date" />`)

Actions per row: **Resend Invitation** | **View Member** (links to `/members/[id]`)

> Do **not** surface WhatsApp Message IDs, delivery receipts, API response codes, or any internal queue metadata in this table.

---

### Section 4 — Member Activity

Columns:
```
Member | Activity | Date & Time
```

Activity labels (use these exact strings for display):
```
Portal Activated | Logged In | Password Reset |
Membership Renewed | Membership Expired |
Invitation Resent | Portal Disabled | Portal Enabled
```

Filters: search, activity type multi-select, date range.

Type:
```ts
export interface MemberActivityEvent {
  id: string
  memberId: string
  memberName: string
  memberNumber: number
  activity: MemberActivityType
  occurredAt: string  // ISO datetime
}

export type MemberActivityType =
  | 'portal_activated' | 'logged_in' | 'password_reset'
  | 'membership_renewed' | 'membership_expired'
  | 'invitation_resent' | 'portal_disabled' | 'portal_enabled'
```

---

### Section 5 — Login Overview

Five summary cards:

| Card | Value |
|---|---|
| Total Active Members | number |
| Logged In Today | number |
| Active This Week | number |
| Pending Invitations | number |
| Suspended Accounts | number |

Recent Logins table (last 20 rows):
```
Member | Last Login | Status (Online / Offline)
```

"Online" = last login within 15 minutes (configurable constant).

---

### Section 6 — WhatsApp Templates

Map directly to `TemplateId` from `types/whatsapp.ts`. Display five configured templates:

| Template | `TemplateId` |
|---|---|
| Member Invitation | `_gymflow_welcome_member` |
| Membership Renewal | `membership_renewed` |
| Expiry Reminder | `membership_expiry_reminder` |
| Birthday Wishes | `_birthday_wishes` |
| Broadcast Messages | `broadcast_message` *(new — add to union)* |

Each template card shows:
- Name
- Status badge: `Approved` (green) | `Pending` (amber) | `Rejected` (red)
- "Configure →" link (stub to `/account` for now)

Type:
```ts
export interface WhatsAppTemplateStatus {
  templateId: TemplateId
  displayName: string
  status: 'approved' | 'pending' | 'rejected'
}
```

---

### Section 7 — Gamification

Four summary cards:
- 🏆 Total XP Earned
- 🥇 Badges Unlocked
- 🔥 Active Workout Streaks
- 🎯 Challenges Completed

Leaderboard preview: top-5 table (Rank | Member | XP | Badges).

Configuration cards (read-only for mock phase, with "Configure" buttons that trigger a `coming soon` toast):
- Enable / Disable Leaderboards (toggle switch)
- XP Multipliers
- Badge Rules
- Achievement Config

---

### Section 8 — Analytics

Six charts using **Recharts** (already in the codebase via `package.json`). Use `ResponsiveContainer` with fixed height (300px).

| Chart | Type | x-axis |
|---|---|---|
| Daily Active Users | AreaChart | Last 30 days |
| Weekly Active Users | BarChart | Last 12 weeks |
| Monthly Active Users | BarChart | Last 12 months |
| Retention Rate (%) | LineChart | Last 12 weeks |
| Avg Session Duration (min) | AreaChart | Last 30 days |
| Activation Conversion Rate (%) | LineChart | Last 12 weeks |

Use `brand-500` (`#2563EB`) as the primary chart colour and `brand-100` for fill areas.

---

### Section 9 — Maintenance

Status row cards (icon + label + status dot):

| Item | Type |
|---|---|
| App Version | string |
| Latest Version | string + "Up to date" badge |
| Maintenance Mode | toggle |
| Supabase Status | `operational \| degraded \| down` |
| WhatsApp API Status | `operational \| degraded \| down` |
| Notification Queue | `number` pending |
| Storage Usage | `${used}MB / ${total}MB` |
| Last Backup | ISO datetime |

Action buttons:
- **Enable Maintenance Mode** — confirmation modal before toggling
- **Clear Cache** — calls a server action stub, shows toast on success
- **Resend Failed Invitations** — server action stub
- **Retry Failed Notifications** — server action stub

---

### Section 10 — Settings

Form with save button (client-side state for mock phase; no API call yet).

Fields:

| Field | Type | Validation |
|---|---|---|
| Portal Name | text | required, max 60 |
| Brand Logo URL | text / file upload stub | optional |
| Primary Colour | `<input type="color">` | hex |
| Support Email | email | valid email |
| Support Phone | tel | optional |
| Privacy Policy URL | url | optional |
| Terms & Conditions URL | url | optional |
| Member App URL | text | read-only, derived from gym slug |
| Invitation Expiry | select: 24h / 48h / 7d / 30d | required |
| Default Language | select: English / Tamil / Hindi | required |
| Timezone | select (IST default) | required |

---

## Mock Data Rules

1. All fixtures in `features/member-app/services/memberAppService.ts`
2. Exported as **typed async functions** that return a `Promise<T>` (so they can be swapped for real queries with no component changes):
   ```ts
   export async function getMemberPortalRows(gymId: string): Promise<MemberPortalRow[]>
   export async function getInvitationActivity(gymId: string): Promise<InvitationActivity[]>
   // etc.
   ```
3. Add a 50–150 ms artificial delay (`await sleep(100)`) to simulate network latency and surface loading states during development
4. Seed with at least 15 realistic rows per table section (Indian names, valid-looking phone numbers, realistic dates)

---

## Loading & Error States

- `app/member-app/loading.tsx`: full-page skeleton that mirrors the Overview + table sections
- Every table: empty state component with icon + message ("No invitations sent yet" etc.)
- Every async action button: disabled + spinner during inflight
- Section-level error boundary (`error.tsx` or try/catch in page) — display a retry card, not a full crash

---

## UI Rules

1. Match `app/dashboard/DashboardClient.tsx` for card and spacing patterns exactly
2. Match `components/layout/NavClient.tsx` for the nav item pattern exactly
3. `brand-*` for interactive elements, `slate-*` for text hierarchy
4. No new Tailwind colours, no inline `style=` for design values
5. Lucide icons only
6. Status badges: use `rounded-full px-2.5 py-0.5 text-xs font-semibold` pattern with semantic colours (green/amber/red/blue)
7. Tables: `w-full text-sm`, `thead` in `slate-500`, rows with `hover:bg-slate-50` and `border-b border-surface-border`

---

## Privacy / Security Rules

**Never render** the following in any table, tooltip, log, or debug panel:
- WhatsApp Message IDs or delivery receipt codes
- API response payloads or HTTP status codes
- JWT tokens or session tokens
- Browser, OS, IP address, or geolocation data
- Device fingerprints
- Webhook or queue internal IDs

---

## Documentation

Update:
- `CHANGELOG.md` — new entry under `[Unreleased]`
- `IMPLEMENTATION_LOG.md` — section covering files created, files modified, architecture decisions, and future extension points

---

## Future Extension Points

Structure the module so these can be added without refactoring:
- Push Notifications tab
- In-App Announcements tab
- QR Check-In Management
- Feedback Management
- Device Management
- Feature Flags
- Mobile App Releases / App Store version tracking
- Crash Analytics

---

## Deliverables Checklist

- [ ] `NAV_ITEMS` updated in `components/layout/NavClient.tsx`
- [ ] `app/member-app/page.tsx` (Server Component, auth guard, data pass-through)
- [ ] `app/member-app/loading.tsx` (skeleton)
- [ ] `app/member-app/MemberAppClient.tsx` (tab controller)
- [ ] All 10 section components under `features/member-app/components/`
- [ ] `features/member-app/services/memberAppService.ts` (all mock data)
- [ ] `types/member-app.ts` (all new types)
- [ ] `CHANGELOG.md` updated
- [ ] `IMPLEMENTATION_LOG.md` updated

> **Do not implement backend integration.** Use only the service layer for data. Await a separate prompt before wiring Supabase queries.
