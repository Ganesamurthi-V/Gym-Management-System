# GymFlow — First-Run Owner Onboarding Tour

> **Goal:** After a gym owner finishes the setup wizard, walk them through every page and
> component of the owner console with an animated, guided tour.
>
> **Library:** [Driver.js](https://driverjs.com/docs) · **Scope:** owner console only (`/owner/*`)

---

## 1. Why Driver.js

Read across the docs (installation, configuration, API, hints, theming). Three primitives ship:

| Primitive | Behaviour | Use here |
|---|---|---|
| **Tour** — `driver({ steps }).drive()` | Sequential, dims page, next/prev/progress | ✅ This is what we need |
| **Highlight** — `.highlight({...})` | One-off spotlight, no buttons | Later, for "new feature" callouts |
| **Hints** — `hints({...}).show()` | Pulsing beacons, click to open, page stays live | Later, for passive discovery |

Config options that matter for our stack specifically:

- **`waitForElement`** (ms) — waits for a step's target to appear before treating it as missing.
  Required because our pages stream (RSC) and because tour steps land after a route change.
- **`skipMissingElement`** — skips a step whose element is absent rather than showing a centered
  fallback. Required because a new gym has empty tables and some nav items are subscription-gated.
- **`onNextClick` override** — taking it over means *we* own navigation and must call
  `driverObj.moveNext()`. This is the hook for crossing pages.
- **`onPopoverRender`** — mutate popover DOM; used for the "Skip tour" affordance.
- **`popoverClass`** + CSS vars (`--driver-popover-font-family`) — theme without DOM surgery.
- **`onHighlighted` / `onDestroyed`** — where we save progress and mark completion.

---

## 2. The two constraints that shape the design

### 2.1 A first-run owner has an empty app

They just finished the wizard. There are **no members, no payments, no dues, no inventory,
no programs**. Every table renders `EmptyState`.

**Consequence:** steps must anchor to things that exist unconditionally —
page headers, stat-card grids (they render with `0`), primary action buttons, filter bars, tabs.
**Never** to table rows, bulk-action bars, or row menus.

This is also an opportunity: the tour should tell them *what to do*, not just what they see
("This is where members appear once you add them — start with the Add Member button").

### 2.2 The tour spans 8 pages, so it will be abandoned partway

~28 steps across Dashboard → Members → Payments → Dues → Attendance → Inventory → Programs →
Member App. Realistically many owners will close it mid-way.

**Consequence:** progress must persist per chapter/step and the tour must **resume**, not restart.
A tour that restarts from step 1 is worse than no tour.

---

## 3. Architecture

```
lib/tours/
  anchors.ts        Selector registry — single source of truth for data-tour keys
  definitions.ts    Chapters + steps as data (all copy lives here)
  useOwnerTour.ts   Client hook: lazy-loads driver.js, owns nav + persistence
app/
  driver-theme.css  Brand-matched popover/overlay styling
api/tours/
  route.ts          GET  → saved progress
  complete/route.ts POST → save progress / mark done
components/tours/
  TourLauncher.tsx  Client component mounted in AppShell; decides whether to start/resume
```

### 3.1 Anchors — `data-tour` attributes

Driver.js needs selectors. We add `data-tour="<key>"`, not IDs or classes.

Reason: additive, zero risk to existing styling or behaviour, greppable, and immune to Tailwind
class churn. Nothing in `components/layout/` currently has IDs or `data-*` hooks, so there is
nothing to reuse.

```ts
// lib/tours/anchors.ts
export const TOUR_ANCHORS = {
  // Shell
  sidebar:      'shell-sidebar',
  accountMenu:  'shell-account-menu',
  trialBanner:  'shell-trial-banner',
  // Nav (rendered from NAV_ITEMS)
  navDashboard: 'nav-dashboard',
  navMembers:   'nav-members',
  // …one per nav item
  // Page-level
  dashStats:      'dash-stats',
  dashExpiring:   'dash-expiring',
  dashReport:     'dash-report-btn',
  membersSearch:  'members-search',
  membersAddBtn:  'members-add-btn',
  membersImport:  'members-import-btn',
  // …etc
} as const

export type TourAnchor = keyof typeof TOUR_ANCHORS
export const at = (k: TourAnchor) => `[data-tour="${TOUR_ANCHORS[k]}"]`
```

Typed lookup means a renamed anchor is a compile error, not a silently skipped step.

**Nav is one edit for all items.** `NAV_ITEMS` in `components/layout/NavClient.tsx` feeds both
`DesktopNav` and `MobileNav`. Extend the type with `tourKey?: TourAnchor` and spread
`data-tour` onto the `<Link>`. One change covers desktop and mobile.

> **Note:** `features/member-app/components/ui.tsx` has shared `StatCard` / `SectionHeader` /
> `Card` primitives, but they are scoped to the member-app feature — the dashboard, members and
> payments pages do not use them. So anchors go on page-level wrappers individually. There is no
> global primitive to hook once.

### 3.2 Chapters, not one flat list

```ts
// lib/tours/definitions.ts
export type TourChapter = {
  id: string              // 'dashboard' | 'members' | …
  route: string           // '/owner/dashboard'
  label: string           // 'Your dashboard' — shown in progress
  steps: DriveStep[]
}
```

Chapters give us three things a flat list cannot: a resume point that survives a route change,
honest progress ("Chapter 3 of 8"), and the ability to reorder or drop a chapter without
renumbering everything.

### 3.3 Crossing pages

Driver.js has no router awareness. The last step of each chapter navigates:

```ts
{
  element: at('navMembers'),
  popover: {
    title: 'Members',
    description: 'Everyone who trains at your gym lives here.',
    onNextClick: () => {
      persistProgress({ chapter: 'members', step: 0 })
      router.push('/owner/members')
      // The tour is torn down by the route change; TourLauncher
      // re-mounts on the new page and resumes from saved progress.
    },
  },
}
```

Two viable mechanisms — **pick one in Phase 1 and stick to it:**

- **(A) Destroy + resume.** Persist, navigate, let the new page's `TourLauncher` restart the
  driver at the saved chapter. Simple, robust, survives a hard refresh. Costs a brief flash
  between pages.
- **(B) Keep one driver alive.** Navigate then `moveNext()`, relying on `waitForElement` to
  bridge the latency. Smoother, but the driver instance must outlive the route change — fragile
  with App Router remounts.

**Recommendation: (A).** The flash is acceptable; surviving refresh is worth more, and it reuses
the same resume path we need for abandonment anyway.

---

## 4. Chapter and step plan

28 steps / 8 chapters. Copy is drafted in the plain, owner-facing register used elsewhere
(no jargon, no feature-speak).

### Chapter 0 — Welcome & shell (3 steps, on `/owner/dashboard`)
| # | Anchor | Copy |
|---|---|---|
| 1 | *(centered, no element)* | "Welcome to GymFlow. This quick tour shows you around — about 2 minutes. You can skip anytime." |
| 2 | `sidebar` | "Everything you manage lives in this menu. Let's go through each one." |
| 3 | `trialBanner` | "You're on a 14-day free trial. This banner tracks what's left." |

### Chapter 1 — Dashboard (4 steps)
| Anchor | Copy |
|---|---|
| `dashStats` | "Your gym at a glance — members, revenue and today's activity. These fill in as you go." |
| `dashExpiring` | "Memberships expiring soon. Check here first each morning." |
| `dashReport` | "Download a daily collection report as PDF." |
| `navMembers` → | "Let's add your first member." |

### Chapter 2 — Members (5 steps)
| Anchor | Copy |
|---|---|
| `membersAddBtn` | "Add a member here — name, phone, plan and start date." |
| `membersImport` | "Already have a list? Import from Excel or CSV instead of typing." |
| `membersSearch` | "Find anyone by name, phone or member ID." |
| `membersFilters` | "Filter by plan, status or expiry." |
| `navPayments` → | "Next: collecting money." |

> Empty-state note: anchor to the **buttons and filter bar**, never the table body.

### Chapter 3 — Payments (3 steps)
`paymentsSummary` (collected today/month) · `paymentsRecordBtn` ("Record a payment") ·
`navDues` →

### Chapter 4 — Dues (3 steps)
`duesList` ("Who owes you money") · `duesCollectBtn` ("Mark as collected — sends a WhatsApp
confirmation") · `navAttendance` →

### Chapter 5 — Attendance (3 steps)
`attendanceCheckIn` · `attendanceKiosk` ("Put a tablet at your door and let members check
themselves in") · `navInventory` →

### Chapter 6 — Inventory & Programs (4 steps)
`inventoryAddBtn` · `inventorySell` ("Sell supplements and track stock") ·
`programsBuilder` ("Build workout plans and assign them") · `navMemberApp` →

### Chapter 7 — Member App (3 steps)
| Anchor | Copy |
|---|---|
| `memberAppOverview` | "Your members get their own app — workouts, progress and rewards." |
| `memberAppTabs` | "Invite members here, track who's activated, and tune gamification." |
| `accountMenu` | "That's the tour. Your gym settings and this tour live in here if you want it again." |

Final step's `onDoneClick` → mark complete, `destroy()`.

---

## 5. Persistence — no schema migration

`gyms.onboarding_data` is already `JSONB` (confirmed in `lib/dal.ts`, written by
`/api/onboarding/complete`). Tour state nests under a `tour` key:

```json
{
  "…existing onboarding fields…",
  "tour": { "chapter": "payments", "step": 1, "completed": false, "startedAt": "2026-08-14" }
}
```

**`GET /api/tours`** → `{ chapter, step, completed }`
**`POST /api/tours/progress`** → `{ chapter, step }` — merges
**`POST /api/tours/complete`** → sets `completed: true`

All three wrapped in `withAuth`, so `gym_id` comes from the session and never the client.
The merge is a server-side read-modify-write in one handler, so it cannot clobber the
onboarding fields written by the wizard.

**Why the DB and not `localStorage`:** an owner who finishes setup on a laptop and opens the app
on their phone should not get the tour again. Gym-scoped, not device-scoped.

---

## 6. Trigger

`OnboardingWizard.tsx:305` currently does:

```ts
setTimeout(() => router.push('/owner/dashboard'), 2800)
```

Change to:

```ts
setTimeout(() => router.push('/owner/dashboard?tour=welcome'), 2800)
```

Deterministic — no race against the `onboarding_completed` write, and no "is this their first
visit?" guessing. `TourLauncher` reads the param, starts Chapter 0, strips the param via
`history.replaceState`.

**Resume** uses saved progress instead of the param, so it works on any owner page.
**Manual replay** from `AccountMenu` → "Take the tour again" (resets progress, pushes
`/owner/dashboard?tour=welcome`).

---

## 7. Risks

### 7.1 Polling refresh will break the tour ⚠️

`ShellGuard` polls `/api/account/status` every 30s and `SessionLifecycle` calls
`router.refresh()` — both added in the Realtime→polling migration. A refresh mid-tour re-renders
the subtree and invalidates Driver.js's cached element reference, so the highlight detaches.

**Fix:** expose `isTourActive()` and skip the poll while a tour is running. A 30-second data
staleness during a 2-minute tour is harmless; a broken overlay is not. Cheaper and more reliable
than calling `driverObj.refresh()` on a timer.

### 7.2 Mobile has no sidebar

Chapters 1–7 end by highlighting a sidebar nav item, which does not exist on mobile until the
hamburger drawer is open. Driving a drawer open mid-tour is fragile.

**Fix:** a separate mobile chapter list targeting `BottomNav`, selected at runtime by viewport.
Same chapter ids and copy, different anchors and fewer steps.

### 7.3 Subscription-gated nav

If a nav item is hidden for an expired subscription, its step's element is missing.
`skipMissingElement: true` globally handles it. A brand-new owner is on trial so all items
render, but replaying the tour later must not break.

### 7.4 `Reports` nav item is `comingSoon` with `href="#"`

Don't include it as a navigating step. Either skip it or highlight it as "coming soon".

---

## 8. Phases

| Phase | Scope | Verification |
|---|---|---|
| **1** | `npm i driver.js`, `driver-theme.css`, `anchors.ts`, `useOwnerTour`, `data-tour` on `NAV_ITEMS` | `tsc` + build clean; a hardcoded 2-step tour renders with brand styling |
| **2** | `GET/POST /api/tours*`, progress persistence | curl all three; confirm `onboarding_data` merge preserves wizard fields |
| **3** | `TourLauncher` + Chapter 0 + Chapter 1, trigger from wizard redirect | Complete wizard as a fresh gym → tour auto-starts; reload mid-tour → resumes |
| **4** | Chapters 2–7, all anchors | Walk end-to-end on a gym with **zero data**; no step points at a missing element |
| **5** | Suppress polling while active (7.1); `AccountMenu` replay entry | Leave a tour open 90s → highlight stays attached |
| **6** | Mobile chapter variant (7.2) | Walk it at 390px width |
| **7** | Polish: reduced-motion, keyboard nav, focus return | `prefers-reduced-motion` disables animation; Esc closes and saves |

Phases 1–4 are the shippable feature. 5–7 are hardening.

---

## 9. Decisions needed before Phase 1

1. **Copy** — draft above is mine. Review/replace, or approve as-is?
2. **Cross-page mechanism** — confirm **(A) destroy + resume** (§3.3).
3. **Tour length** — 28 steps ≈ 2–3 min. Acceptable, or split into a short 8-step
   "essentials" tour plus optional per-page tours the owner opts into?
4. **Skippability** — allow skip on every step (recommended), or only after Chapter 0?
