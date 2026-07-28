# GymFlow Member PWA — Development Roadmap

**Version:** 1.1
**Target MVP:** 9 weeks from kickoff (OTP login removed from M0; saves ~4h)

---

## 1. Milestone Overview

| Milestone | Scope | Duration | Cumulative |
|---|---|---|---|
| M0 — Foundation | Project setup, auth, PWA shell | 1 week | Week 1 |
| M1 — Core Member Data | Profile, membership, payments, dashboard | 2 weeks | Week 3 |
| M2 — Attendance | Attendance display, QR card | 1 week | Week 4 |
| M3 — Workout | Plan view, active session tracker | 2 weeks | Week 6 |
| M4 — Progress & Diet | Measurements, charts, diet plan, water tracker | 1.5 weeks | Week 7.5 |
| M5 — Gamification | XP, badges, leaderboards, challenges, referrals | 1.5 weeks | Week 9 |
| M6 — Notifications & PWA Polish | Push, offline, install, performance | 1 week | Week 10 |
| M7 — QA & Launch | Testing, bug fixes, production deploy | Parallel | — |

---

## 2. Sprint Breakdown

### M0 — Foundation (Week 1)

**Goal:** A working PWA shell with email+password auth, navigation, and CI/CD.

| Task | Notes | Est. |
|---|---|---|
| Init Next.js 15 project with TypeScript + Tailwind | App Router, `src/` structure | 2h |
| Configure Supabase client (anon key, env vars) | `lib/supabase.ts`, typed client | 1h |
| Implement auth: Email + Password login | Supabase Auth, error states, lockout after 5 failures | 4h |
| Auth session management (refresh, persist) | supabase-js handles; add visibility listener | 2h |
| Protected route middleware | `middleware.ts` — redirect to /login if no session | 2h |
| Bottom navigation shell (5 tabs) | Home, Workout, Progress, Rewards, Profile | 3h |
| Web App Manifest | Icons, colours, shortcuts | 2h |
| next-pwa configuration | Workbox, basic caching strategies | 3h |
| Vercel deployment + CI | GitHub Actions, preview URLs | 2h |
| iOS Safari meta tags | apple-touch-icon, status bar | 1h |
| `design-tokens.css` integration | Import tokens, confirm CSS variables render | 1h |

**Dependencies:** Supabase project access, domain `member.gymflow.sbs` configured.

---

### M1 — Core Member Data (Weeks 2–3)

**Goal:** Members can see their profile, membership status, and payment history.

| Task | Notes | Est. |
|---|---|---|
| TanStack Query setup + Supabase query helpers | `lib/queries.ts`, typed hooks | 3h |
| Dexie.js IndexedDB setup | Schema per §5 of PWA Technical Spec | 3h |
| DB migration: add PWA columns to `members` | `auth_user_id`, `photo_url`, `member_code`, `blood_group`, `emergency_*`, `medical_notes` | 2h |
| `generate_member_code` trigger deployed | Auto-generates code on member insert | 1h |
| Home Dashboard — welcome banner | Greeting by time of day, gym logo, brand colour | 3h |
| Gym brand colour injection at runtime | CSS variable override from `gyms.brand_color` | 2h |
| Home Dashboard — membership status card | Status, days remaining, urgency colour coding | 4h |
| Home Dashboard — attendance summary widget | Streak, monthly count | 3h |
| Home Dashboard — XP widget + motivation quote | Level badge, XP bar, daily quote | 2h |
| Membership screen — plan details + benefits | Plan, dates, features JSONB list | 4h |
| Membership screen — available plans for renewal | Bottom sheet with plan cards | 3h |
| Payments screen — history list | Sort newest first, status badges | 4h |
| Invoice PDF download | jsPDF, gym letterhead, member details | 5h |
| Profile screen — personal details | All fields incl. blood group; inline editing | 6h |
| Profile screen — emergency contact + medical notes | Form, Supabase PATCH | 3h |
| Profile photo upload | Camera/gallery picker → Supabase Storage | 3h |
| Logout flow | POST /auth/v1/logout + clear all caches | 2h |

**Dependencies:** M0 complete. DB migration for PWA columns applied.

---

### M2 — Attendance & Membership Card (Week 4)

**Goal:** Members can view their attendance and show their QR card for check-in.

| Task | Notes | Est. |
|---|---|---|
| Digital membership card screen | Portrait layout, member_code, photo, plan, expiry | 4h |
| QR code generation (via Edge Function) | `generate-qr` Edge Function; 4-min refresh timer | 5h |
| QR offline cache | Last valid payload in Dexie.js `metadata` | 2h |
| Screen wake lock on card screen | `navigator.wakeLock`; reacquire on visibility | 2h |
| Attendance calendar view | Monthly grid, colour-coded circles | 6h |
| Attendance summary stats | Streak (RPC), longest streak, total, % | 4h |
| Attendance weekly bar chart | Recharts, current vs last week | 3h |
| Month navigation (prev/next) | Calendar re-renders for selected month | 2h |

**Dependencies:** M1 complete. `get_attendance_streak` RPC deployed. `generate-qr` Edge Function deployed.

---

### M3 — Workout Module (Weeks 5–6)

**Goal:** Members can view their assigned plan and track live workout sessions.

| Task | Notes | Est. |
|---|---|---|
| Workout plan overview screen | Plan name, goal, day list with current day highlighted | 3h |
| Workout day view — exercise list | Sets × reps, weight, rest time, expandable notes | 4h |
| Start workout session | POST `workout_sessions`; navigate to first exercise | 2h |
| Active workout: set tracking UI | Checkbox per set, reps/weight inputs; 56px touch targets | 8h |
| Rest timer countdown | Full-screen, `--font-mono`, skip button, haptic | 5h |
| Progress indicator (exercise N/M) | Linear progress bar, swipe navigation | 2h |
| End workout confirmation dialog | Elevation 4 modal, partial completion handling | 3h |
| Workout completion summary | Duration, exercises_done, sets_done, volume_kg, XP animated | 4h |
| PATCH workout_sessions on complete | `completed_at`, `duration_min`, `exercises_done`, `sets_done`, `volume_kg` | 2h |
| Offline workout tracking | Write sets to Dexie.js sync queue if offline | 5h |
| Incomplete session recovery | Detect open session on next open; resume/discard | 4h |
| Workout history list | Completed sessions, tap for set details | 4h |

**Dependencies:** M2 complete. Workout plans exist in DB (trainer assigns via admin). Seed test plans for dev.

---

### M4 — Progress Tracking & Diet (Weeks 7–7.5)

**Goal:** Members can log measurements, view charts, upload photos, and see their diet plan with water tracker.

| Task | Notes | Est. |
|---|---|---|
| Progress — log measurement form | All body measurement fields; optional except date | 5h |
| Progress — weight chart (Recharts) | 30d default, `--chart-weight`, time range toggle | 5h |
| Progress — body measurement charts | Per-measurement-type line charts, tabs | 4h |
| Progress — progress photos upload | Camera + gallery, type chip selector | 6h |
| Progress — photo gallery grid | Chronological, full-screen lightbox on tap | 3h |
| Diet plan screen — macro summary | Calories, protein, carbs, fats, water target | 3h |
| Diet plan screen — meal cards | Sort by `sort_order`, Breakfast → Dinner | 3h |
| Diet plan — water intake tracker | Tap to increment glasses; UPSERT `water_intake_logs` | 4h |
| Diet plan — no plan empty state | Illustration + contact trainer button | 1h |
| Offline cache for measurements + diet | Dexie persistence | 2h |

**Dependencies:** M3 complete. Supabase Storage bucket `member-photos` configured with RLS. `water_intake_logs` table deployed.

---

### M5 — Gamification (Weeks 8–9)

**Goal:** XP, levels, badges, leaderboards, challenges, and referrals are live.

| Task | Notes | Est. |
|---|---|---|
| `award_xp` Edge Function | Calls DB `award_xp()` function; checks weekly measurement cap | 4h |
| DB triggers for XP events | Attendance INSERT → 50 XP; workout session complete → 100 XP | 6h |
| `longest_streak` update in `award_xp` | Already in DB function; verify via tests | 1h |
| Badge catalogue seed data | 25 badges, icon placeholders (emoji until assets ready) | 3h |
| Badge trigger Edge Function | Runs on attendance/workout/referral events | 8h |
| `member_xp` Realtime subscription | Level-up detection; trigger celebration | 3h |
| Rewards tab — level/XP hero card | Level badge, XP bar with `--gradient-xp` glow | 4h |
| Rewards tab — XP activity feed | Last 20 xp_transactions | 2h |
| Rewards tab — badge grid | 4-col grid; earned colour, locked greyscale | 5h |
| Level up celebration overlay | Full-screen, scale animation, confetti, dismiss | 5h |
| Badge earned overlay | Zoom in, particle burst, haptic | 4h |
| Leaderboard — 3 tab types | Weekly / Monthly / All-time; sticky current member row | 6h |
| `get_leaderboard` RPC tested | Per DB Schema §9 | 2h |
| Challenges — list screen | Active + upcoming + past tabs | 4h |
| Challenges — join + progress bar | `challenge_participants` insert; progress bar | 4h |
| Challenge auto-update triggers | Attendance + workout session triggers | 5h |
| Referral — my code + share | `referrals` row, native Web Share API | 4h |
| Referral — tracking list | Status badges, summary count | 2h |

**Dependencies:** M4 complete. Badge icon assets (use emoji placeholders until final assets).

---

### M6 — Notifications & PWA Polish (Week 10)

**Goal:** Push notifications working, offline experience polished, install prompt live.

| Task | Notes | Est. |
|---|---|---|
| Push subscription registration | VAPID, `register-push` Edge Function | 4h |
| Service worker push handler | `showNotification`, `notificationclick` deep link routing | 3h |
| Notification centre UI | List, mark read, mark all read, unread badge on bell icon | 4h |
| Realtime in-app notifications | Supabase channel → toast banner | 3h |
| Announcement Realtime channel | New announcement → dismissible home banner | 2h |
| Notification permission prompt UX | Friendly explanation before browser prompt | 2h |
| Notification settings in Profile | Per-type toggles | 3h |
| Custom install banner (Android) | `beforeinstallprompt` flow; show after 2 visits | 3h |
| iOS install instructions modal | Detect iOS Safari, show step-by-step | 2h |
| Offline fallback page | `/offline.html` with cached route links | 2h |
| Sync queue processor (finalise) | Online + visibilitychange listeners; error handling | 2h |
| Update notification | New SW → refresh toast with reload button | 2h |
| Lighthouse audit + fixes | Target 95+ PWA score | 5h |
| Performance audit | Bundle analysis, lazy loading of heavy routes | 4h |
| Cross-browser QA | Chrome, Safari, Firefox, Samsung | 4h |

**Dependencies:** M5 complete. VAPID keys generated and stored in Supabase secrets.

---

## 3. Parallel Tracks

These run throughout development, not as separate milestones:

| Track | Owner | Notes |
|---|---|---|
| UI component library | Dev | Build shadcn/custom components as needed; follow `design-tokens.css` v2.0 |
| TanStack Query patterns | Dev | Establish consistent fetch + mutation patterns in M0/M1; reuse across all milestones |
| Supabase RLS policies | Dev | Write and test RLS for each table as it is built |
| Figma designs | Design | Screens designed 1 sprint ahead of dev |
| Content | PM | Badge icons, empty state illustrations, motivation quote list (100+) |

---

## 4. Dependencies & Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| DB migration for PWA member columns | Blocks profile and QR in M1/M2 | Run migration before M1 kickoff |
| `water_intake_logs` table deploy | Blocks diet water tracker in M4 | Include in M1 DB migration batch |
| `member_xp.longest_streak` column | Blocks gamification stats in M5 | Include in initial `member_xp` table creation |
| Workout plans in DB | No data to show in M3 | Seed test data for dev environment |
| Badge icon assets | Blocks final badge UI in M5 | Use emoji placeholders; swap on asset delivery |
| Admin assigns trainer plans | Member can't see workout | Show "No plan" empty state gracefully |
| VAPID keys and Edge Function deploy | Blocks push notifications | Can defer to M6; flag in M0 setup checklist |
| iOS push notification support | iOS 16.4+ required for Web Push | Document minimum iOS version; show graceful fallback for older iOS |
| Supabase Storage RLS for `member-photos` | Progress photos inaccessible | Configure before M4 kickoff |

---

## 5. Post-MVP Roadmap (v1.1+)

| Feature | Priority | Notes |
|---|---|---|
| Magic link login | High | Passwordless; better UX for returning members |
| Google / Apple SSO | High | Reduce sign-in friction |
| AI Coach | High | Edge Function + Anthropic API; requires `gyms.ai_coach_enabled` flag (v2 schema) |
| Gym Feed (announcements, social achievements) | Medium | Social layer on Home tab |
| Class booking | Medium | New tables + admin side |
| Barcode on membership card | Medium | Alternate scan method |
| Apple Health / Health Connect sync | Low | iOS steps + heart rate |
| Dark/light mode toggle | Low | Currently dark-mode only |
| Multi-language support (Tamil, Hindi) | Medium | i18n routing |
| Push notification preferences table | Medium | Replace JSONB field with proper `notification_preferences` table |
