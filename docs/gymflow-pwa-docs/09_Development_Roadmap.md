# GymFlow Member PWA — Development Roadmap

**Version:** 1.0  
**Target MVP:** 10 weeks from kickoff  

---

## 1. Milestone Overview

| Milestone | Scope | Duration | Cumulative |
|---|---|---|---|
| M0 — Foundation | Project setup, auth, PWA shell | 1 week | Week 1 |
| M1 — Core Member Data | Profile, membership, payments, dashboard | 2 weeks | Week 3 |
| M2 — Attendance | Attendance display, QR card | 1 week | Week 4 |
| M3 — Workout | Plan view, active session tracker | 2 weeks | Week 6 |
| M4 — Progress & Diet | Measurements, charts, diet plan | 1.5 weeks | Week 7.5 |
| M5 — Gamification | XP, badges, leaderboards, challenges | 1.5 weeks | Week 9 |
| M6 — Notifications & PWA Polish | Push, offline, install, performance | 1 week | Week 10 |
| M7 — QA & Launch | Testing, bug fixes, production deploy | Parallel | — |

---

## 2. Sprint Breakdown

### M0 — Foundation (Week 1)

**Goal:** A working PWA shell with auth, navigation, and CI/CD.

| Task | Notes | Est. |
|---|---|---|
| Init Next.js 15 project with TypeScript + Tailwind | App Router, `src/` structure | 2h |
| Configure Supabase client (anon key, env vars) | `lib/supabase.ts`, typed client | 1h |
| Implement auth: Email + Password login | Supabase Auth, error handling | 4h |
| Implement auth: Phone OTP login | OTP input component, resend | 4h |
| Auth session management (refresh, persist) | supabase-js handles, add listener | 2h |
| Protected route middleware | `middleware.ts` — redirect if not authed | 2h |
| Bottom navigation shell (5 tabs) | React component, active state | 3h |
| Web App Manifest | Icons, colours, shortcuts | 2h |
| next-pwa configuration | Workbox, basic caching | 3h |
| Vercel deployment + CI | GitHub Actions, preview URLs | 2h |
| iOS Safari meta tags | apple-touch-icon, status bar | 1h |

**Dependencies:** Supabase project access, domain `member.gymflow.in` configured.

---

### M1 — Core Member Data (Weeks 2–3)

**Goal:** Members can see their profile, membership status, and payment history.

| Task | Notes | Est. |
|---|---|---|
| TanStack Query setup + Supabase query helpers | `lib/queries.ts` | 3h |
| Dexie.js IndexedDB setup | Schema, typed tables | 3h |
| Home Dashboard — welcome banner | Greeting, gym logo, brand colour | 3h |
| Home Dashboard — membership card widget | Status, days remaining, colour coding | 4h |
| Home Dashboard — attendance summary widget | Streak, monthly count | 3h |
| Home Dashboard — motivation quote | Rotation logic | 1h |
| Membership screen — plan details | Plan, dates, benefits, renewal CTA | 4h |
| Membership screen — gym contact for renewal | WhatsApp/phone link | 1h |
| Payments screen — history list | Sort, filter by status | 4h |
| Invoice PDF download | jsPDF client-side generation | 5h |
| Profile screen — personal details | Inline editing, photo upload | 6h |
| Profile screen — emergency contact + medical notes | Form, Supabase save | 3h |
| Logout flow | Clear all cache + redirect | 2h |
| Gym brand colour injection at runtime | CSS variables from Supabase | 2h |

**Dependencies:** M0 complete.

---

### M2 — Attendance & Membership Card (Week 4)

**Goal:** Members can view their attendance and show their QR card for check-in.

| Task | Notes | Est. |
|---|---|---|
| Digital membership card screen | Portrait layout, photo, member code | 4h |
| QR code generation (client-side) | qrcode.js, rotating signed payload | 5h |
| Screen wake lock on card screen | `navigator.wakeLock` | 2h |
| Attendance calendar view | Monthly grid, colour-coded days | 6h |
| Attendance summary stats | Streak, longest streak, total, % | 4h |
| Attendance weekly bar chart | Recharts, this week vs last | 3h |
| Streak calculation display | Call `get_attendance_streak()` RPC | 2h |
| Cache membership card for offline | Service worker + Dexie | 3h |

**Dependencies:** M1 complete. `get_attendance_streak` DB function deployed.

---

### M3 — Workout Module (Weeks 5–6)

**Goal:** Members can view their assigned plan and track live workout sessions.

| Task | Notes | Est. |
|---|---|---|
| Workout plan overview screen | Plan name, goal, day list | 3h |
| Workout day view — exercise list | Sets, reps, weight, rest time, notes | 4h |
| Start workout session | Create `workout_sessions` record | 2h |
| Active workout: set tracking UI | Checkbox per set, reps/weight inputs | 8h |
| Rest timer countdown | Full-screen, skip button, haptic | 5h |
| Progress indicator (exercise N/M) | Linear progress bar | 2h |
| End workout confirmation | Modal, partial completion handling | 3h |
| Workout completion summary | Duration, sets, XP earned | 3h |
| Offline workout tracking | Write to sync queue if offline | 5h |
| Incomplete session recovery | Detect on next open, resume/discard | 4h |
| Workout history list | Completed sessions, tap for details | 4h |
| Workout session set details | Sets, reps, weight per exercise | 3h |

**Dependencies:** M2 complete. Workout plans exist in DB (trainer assigns via admin).

---

### M4 — Progress Tracking & Diet (Weeks 7–7.5)

**Goal:** Members can log measurements, view charts, and see their diet plan.

| Task | Notes | Est. |
|---|---|---|
| Progress — log measurement form | All body measurements, save | 5h |
| Progress — weight chart (Recharts) | 30d default, time range toggle | 5h |
| Progress — body measurements charts | Tabs per measurement, line chart | 4h |
| Progress — progress photos upload | Camera + gallery, type selection | 6h |
| Progress — photo gallery grid | Chronological, full-screen tap | 3h |
| Diet plan screen — macro summary | Calories, protein, carbs, fats, water | 3h |
| Diet plan screen — meal list | Breakfast → Dinner cards | 3h |
| Diet plan — no plan state | Empty state illustration | 1h |
| Offline cache measurements + diet | Dexie persistence | 2h |

**Dependencies:** M3 complete. Supabase Storage bucket configured for progress photos.

---

### M5 — Gamification (Weeks 8–9)

**Goal:** XP, levels, badges, leaderboards, and challenges are live.

| Task | Notes | Est. |
|---|---|---|
| `award_xp` Edge Function | VAPID, DB function call | 4h |
| DB triggers for XP events | Attendance, workout session complete | 6h |
| Badge catalogue seed data | 25 badges, icons | 3h |
| Badge trigger Edge Function | Check all triggers on relevant events | 8h |
| `member_xp` sync to client | Realtime channel for level-up | 3h |
| Rewards tab — level/XP hero card | Level badge, XP bar | 4h |
| Rewards tab — XP activity feed | Last 20 transactions | 2h |
| Rewards tab — badge grid | Earned + locked, tap detail | 5h |
| Level up celebration overlay | Animation, confetti, dismiss | 5h |
| Badge earned overlay | Zoom in, particle burst | 4h |
| Leaderboard — weekly/monthly/alltime | Tabs, current member highlight | 6h |
| `get_leaderboard` DB function/view | Optimised SQL | 4h |
| Challenges — list screen | Active + upcoming + past | 4h |
| Challenges — join + track progress | Progress bar, completion state | 4h |
| Challenge auto-update triggers | Attendance and workout triggers | 5h |
| Referral — my code + share | Unique code, native share | 4h |
| Referral — tracking list | Referral status display | 2h |

**Dependencies:** M4 complete. Badge icon assets prepared.

---

### M6 — Notifications & PWA Polish (Week 10)

**Goal:** Push notifications working, offline experience polished, install prompt live.

| Task | Notes | Est. |
|---|---|---|
| Push subscription registration | VAPID, `register-push` Edge Function | 4h |
| Service worker push handler | `showNotification`, `notificationclick` | 3h |
| Notification centre UI | List, mark read, mark all read | 4h |
| Realtime in-app notifications | Supabase channel → toast banner | 3h |
| Notification permission prompt UX | Friendly explanation screen | 2h |
| Notification settings in Profile | Per-type toggles | 3h |
| Custom install banner (Android) | `beforeinstallprompt` flow | 3h |
| iOS install instructions modal | Detect iOS, show steps | 2h |
| Offline fallback page | `/offline.html` with cached routes | 2h |
| Sync queue processor | Online event listener, Dexie queue | Already in M3 |
| Update notification | New SW → refresh toast | 2h |
| Lighthouse audit + fixes | Target 95+ PWA score | 5h |
| Performance audit | Bundle analysis, lazy loading | 4h |
| Cross-browser QA | Chrome, Safari, Firefox, Samsung | 4h |

**Dependencies:** M5 complete. VAPID keys generated and stored.

---

## 3. Parallel Tracks

These run throughout development, not as separate milestones:

| Track | Owner | Notes |
|---|---|---|
| UI component library | Dev | Build shadcn/custom components as needed |
| TanStack Query patterns | Dev | Establish consistent fetch + mutation patterns early |
| Supabase RLS policies | Dev | Write and test RLS for each table as it's built |
| Figma designs | Design | Screens designed 1 sprint ahead of dev |
| Content | PM | Badge icons, empty state illustrations, motivation quotes |

---

## 4. Dependencies & Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| Workout plans in DB | No data to show | Seed test data for dev |
| Badge icon assets | Blocks gamification UI | Use emoji placeholders until ready |
| Admin assigns trainer plans | Member can't see workout | Show "no plan" state gracefully |
| VAPID keys and Supabase Edge Function deploy | Blocks push notifications | Can skip until M6 |
| iOS push notification support | iOS 16.4+ required for Web Push | Document minimum iOS version, show fallback for older iOS |
| Supabase Storage bucket permissions | Progress photos inaccessible | Configure Storage RLS before M4 |

---

## 5. Post-MVP Roadmap (v1.1+)

| Feature | Priority | Notes |
|---|---|---|
| Magic link login | High | Passwordless, better UX |
| Google login | High | Reduce friction |
| AI Coach | High | Edge Function + Anthropic API |
| Gym Feed (announcements, achievements) | Medium | Social layer |
| Class booking | Medium | New table + admin side |
| Barcode on membership card | Medium | Future: alternate scan method |
| Apple Health integration | Low | iOS only |
| Health Connect (Android) | Low | Steps, heart rate sync |
| Dark/light mode toggle | Low | Currently dark-only |
| Multi-language support (Tamil, Hindi) | Medium | i18n routing |
