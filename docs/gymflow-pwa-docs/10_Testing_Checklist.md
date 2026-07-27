# GymFlow Member PWA — Testing Checklist

**Version:** 1.0  
Legend: ✅ Pass | ❌ Fail | ⚠️ Partial | — Not Applicable

---

## 1. Functional Testing

### 1.1 Authentication

| Test | Expected | Status |
|---|---|---|
| Login with valid email + password | Redirect to home | |
| Login with invalid password | Error message shown, no redirect | |
| Login with wrong email | "Account not found" message | |
| 5 wrong password attempts | Account locked, "try again in 15 min" | |
| Unregistered phone | "No account found" shown | |
| Session persists after browser close | Still logged in on reopen | |
| Session expires → auto-refresh | Continues working without prompt | |
| Manual logout | Redirected to login, cache cleared | |
| Login on second device | Both sessions work simultaneously | |

### 1.2 Home Dashboard

| Test | Expected | Status |
|---|---|---|
| Welcome message — morning | "Good Morning, [Name]" | |
| Welcome message — evening | "Good Evening, [Name]" | |
| Gym logo displayed | Gym's logo from Supabase | |
| Brand colour applied | UI matches gym's brand colour | |
| Membership > 14 days: green status | Green indicator | |
| Membership 7–14 days: amber status | Amber indicator | |
| Membership < 7 days: red status | Red indicator | |
| Expired membership: banner shown | "Membership expired. Renew now." | |
| Streak counter correct | Matches attendance records | |
| Dashboard loads within 2s on first load | Measured with DevTools | |
| All widgets render without errors | No console errors | |

### 1.3 Digital Membership Card

| Test | Expected | Status |
|---|---|---|
| Card displays all member info | Name, ID, plan, expiry, photo | |
| QR code renders and is scannable | Scan with phone camera | |
| QR code rotates every 4 minutes | New QR without page reload | |
| QR code works offline (last cached) | Scan succeeds offline | |
| Screen wake lock activates | Screen stays on without tap | |
| Wake lock releases on back navigation | Screen can sleep again | |
| Member photo displayed | Correct photo shown | |
| Expired membership: warning on card | "Expired" badge shown | |

### 1.4 Attendance

| Test | Expected | Status |
|---|---|---|
| Calendar shows present days | Filled circles on attended days | |
| Calendar shows absent days | Empty circles | |
| Today highlighted correctly | Outlined circle | |
| Tapping a day shows check-in time | Time shown if available | |
| Streak correct after today's visit | Increments by 1 | |
| Streak breaks after missed day | Resets to new count from next visit | |
| Longest streak never decreases | Stat retained after streak break | |
| Monthly attendance percentage correct | Matches (present / working days) × 100 | |
| Monthly navigation (prev/next month) | Calendar updates correctly | |

### 1.5 Membership Screen

| Test | Expected | Status |
|---|---|---|
| Plan name and details displayed | Correct data from DB | |
| Benefits list rendered | All features from `membership_plans.features` | |
| Payment status shown | Paid / Pending badge | |
| Renew button hidden when > 14 days | Button not visible | |
| Renew button shown when ≤ 14 days | Button visible + functional | |
| Renew button opens gym contact | WhatsApp / phone link works | |

### 1.6 Payments

| Test | Expected | Status |
|---|---|---|
| Payment history loads | All records shown, newest first | |
| Each record shows: date, amount, mode, status | Correct data | |
| Invoice PDF download | PDF opens with correct details | |
| Invoice PDF: gym letterhead included | Logo and gym name shown | |
| Pending payment banner shown | Warning banner displayed | |
| Empty state (no payments) | "No payment history yet" shown | |

### 1.7 Workout Module

| Test | Expected | Status |
|---|---|---|
| Assigned plan loads correctly | Correct exercises, sets, reps | |
| No plan: empty state shown | "No plan assigned yet" message | |
| Workout day list displayed | All days with names | |
| "Start Workout" creates session record | `workout_sessions` row inserted | |
| Completing a set marks checkbox | Visual feedback | |
| Rest timer starts after set completion | Countdown begins | |
| Rest timer can be skipped | Skip button works | |
| Next exercise navigation works | Exercise index advances | |
| Progress indicator updates | "3 / 8" increments correctly | |
| End workout prompts confirmation | Modal shown | |
| Confirming end workout marks complete | `completed_at` updated | |
| Partial workout (< 100%) saves correctly | Session marked with exercises done | |
| XP awarded on completion | XP transaction created | |
| Workout summary screen shown | Duration, XP displayed | |
| Workout history lists completed sessions | Sorted newest first | |
| App backgrounded mid-workout | Session remains open on return | |
| Offline workout tracking | Sets saved locally, synced on reconnect | |
| Force quit mid-workout | Recovery prompt on next open | |

### 1.8 Progress Tracking

| Test | Expected | Status |
|---|---|---|
| Log measurement — all optional fields | Saves with only required fields (date) | |
| Log measurement — all fields | All values stored | |
| Weight chart renders | Line chart with correct data points | |
| Time range toggle works | Chart re-renders for 7d / 30d / 90d / All | |
| Upload progress photo — camera | Photo captured and uploaded | |
| Upload progress photo — gallery | Photo selected and uploaded | |
| Photo gallery shows all uploaded photos | Grid, chronological | |
| Full-screen photo on tap | Photo expands, date shown | |
| Empty state when no measurements | Illustration + prompt | |

### 1.9 Notifications

| Test | Expected | Status |
|---|---|---|
| Notification list loads | All notifications shown | |
| Unread notifications have indicator | Visual distinction | |
| Tapping notification marks as read | Indicator removed | |
| "Mark all read" clears all unread | All indicators removed | |
| Tapping notification deep-links | Correct screen opened | |
| Push permission prompt shown on first login | Permission dialog appears | |
| Push permission granted → subscription saved | Row in `push_subscriptions` | |
| Push notification received when app closed | OS notification shown | |
| Tapping push notification opens app | Correct screen opened via `url` data | |
| In-app toast for new notification | Banner appears in foreground | |

### 1.10 Gamification

| Test | Expected | Status |
|---|---|---|
| XP awarded after attendance check-in | +50 XP within 5s | |
| XP awarded after workout completion | +100 XP shown | |
| XP total updates in real-time | No page refresh needed | |
| Level calculation correct | Level matches XP threshold table | |
| Level up triggers celebration overlay | Full-screen animation shown | |
| Level up notification created | In notification centre | |
| Badge earned on first workout | "First Rep" badge appears | |
| Badge earned on 7-day streak | "Week Warrior" badge appears | |
| Badge grid: earned in colour | Full colour, no lock icon | |
| Badge grid: unearned greyed | Greyscale + lock icon | |
| Tapping earned badge shows detail | Sheet with description, XP, date | |
| Tapping locked badge shows how-to-earn | "Complete X workouts" text | |
| Leaderboard shows top 50 members | List with ranks | |
| Current member shown even if outside top 50 | Sticky row at bottom | |
| Leaderboard tabs switch correctly | Weekly / Monthly / All-time | |
| Challenge list shows active challenges | Correct challenges for gym | |
| Join challenge creates participant row | `challenge_participants` inserted | |
| Challenge progress updates after attendance | Auto-tracked progress increments | |
| Completed challenge shows ✓ and XP | Badge + XP awarded | |
| Referral code is unique | Different from all other members | |
| Share referral opens native share | OS share sheet shown | |

### 1.11 Profile

| Test | Expected | Status |
|---|---|---|
| Profile loads with correct data | All fields populated | |
| Inline edit name → save | DB updated, UI reflects | |
| Emergency contact save | Stored in DB | |
| Medical notes save | Stored in DB | |
| Update profile photo | New photo shown | |
| Notification settings toggles | Preferences saved | |

---

## 2. Offline Testing

| Test | Expected | Status |
|---|---|---|
| Go offline → open app | App loads (service worker cache) | |
| Membership card shown offline | Cached card displayed | |
| Attendance calendar shown offline | Cached data shown | |
| Workout plan shown offline | Cached plan shown | |
| Notifications shown offline | Cached notifications shown | |
| Log workout set offline | Saved to sync queue | |
| Come back online → sync queue processed | Sets uploaded to Supabase | |
| Offline indicator shown | "Offline" badge or banner | |
| Stale data indicator shown | "Last synced X ago" | |
| Leaderboard not available offline | "Available when online" shown | |

---

## 3. PWA Testing

### 3.1 Installability

| Test | Expected | Status |
|---|---|---|
| Chrome: install banner appears | After 2+ visits, before 2 dismissals | |
| Install banner dismissed twice → stops showing | Banner not shown again | |
| Android: install from Chrome | App installs to home screen | |
| Installed app opens in standalone mode | No browser UI visible | |
| iOS: add to home screen instructions shown | Modal with steps | |
| iOS: installed app opens standalone | No Safari browser bar | |
| App shortcut (Home/Membership Card) works | Shortcut opens correct screen | |

### 3.2 Service Worker

| Test | Expected | Status |
|---|---|---|
| Service worker registered | DevTools → Application → SW shows active | |
| Static assets cached after first load | Cache Storage shows assets | |
| API responses cached (NetworkFirst) | Supabase responses in cache | |
| New SW detected → update toast shown | "New version available" toast | |
| Refresh updates app | New SW activates | |

### 3.3 Lighthouse Scores

Run `lighthouse https://member.gymflow.in` in Chrome DevTools:

| Category | Target | Actual |
|---|---|---|
| Performance | ≥ 90 | |
| Accessibility | ≥ 90 | |
| Best Practices | ≥ 90 | |
| SEO | ≥ 80 | |
| PWA | 100 | |

---

## 4. Performance Testing

| Test | Target | Tool |
|---|---|---|
| First Contentful Paint (FCP) | < 1.5s | Lighthouse |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse |
| Time to Interactive (TTI) | < 3s | Lighthouse |
| Total Blocking Time (TBT) | < 200ms | Lighthouse |
| Cumulative Layout Shift (CLS) | < 0.1 | Lighthouse |
| First load on 3G throttled | < 5s | DevTools throttle |
| Subsequent load (SW cached) | < 1s | DevTools |
| Bundle size (JS) | < 300 KB gzipped | `next build` output |

---

## 5. Security Testing

| Test | Expected | Status |
|---|---|---|
| API call without auth token | 401 returned | |
| Access other member's data via Supabase | RLS blocks, empty result | |
| Access other gym's data | RLS blocks | |
| XSS: inject `<script>` in name field | Escaped in output, no execution | |
| JWT manipulation (edit payload) | Rejected by Supabase | |
| QR code replay after expiry | "Expired QR" error from Edge Function | |
| Sensitive data in service worker cache | No PII in cache | |
| HTTPS enforced | HTTP redirects to HTTPS | |
| Expired session: API call | 401 returned, auto-refresh attempted | |

---

## 6. Accessibility Testing

| Test | Expected | Status |
|---|---|---|
| Screen reader: VoiceOver (iOS) | All interactive elements announced | |
| Screen reader: TalkBack (Android) | All interactive elements announced | |
| Keyboard navigation (desktop) | All elements reachable via Tab | |
| Focus ring visible | Visible on all focusable elements | |
| Colour contrast: body text | ≥ 4.5:1 ratio | |
| Colour contrast: large text | ≥ 3:1 ratio | |
| Touch targets ≥ 44×44px | No small tappable areas | |
| Font size 200%: layout intact | No overflow, no broken layouts | |
| `prefers-reduced-motion` respected | Animations disabled | |
| ARIA labels on icon buttons | `aria-label` present | |
| XP gain announced to screen reader | Live region fires | |

---

## 7. Cross-browser / Cross-device Testing

| Device / Browser | Auth | Dashboard | Card | Workout | Push Notif |
|---|---|---|---|---|---|
| Android 12 — Chrome 124 | | | | | |
| Android 12 — Firefox | | | | ─ (no push) | |
| Android 12 — Samsung Browser | | | | | |
| iOS 17 — Safari | | | | | |
| iOS 16 — Safari | | | | ─ (push: 16.4+ only) | |
| iPhone SE (375px) | | | | | ─ |
| iPad (768px) | | | | | ─ |
| Desktop — Chrome (Windows) | | | | | |
| Desktop — Chrome (Mac) | | | | | |
| Desktop — Safari (Mac) | | | | ─ | |
| Desktop — Firefox | | | | ─ | |

---

## 8. User Acceptance Testing (UAT) Scenarios

Conduct with 3–5 real gym members before launch.

| Scenario | Tester Instruction | Pass Criteria |
|---|---|---|
| First login | "Log in using the link/code your gym gave you." | Logged in, home shown |
| Find membership info | "How many days are left on your membership?" | Finds it within 30 seconds |
| Show QR for attendance | "Show the QR code you'd use at the gym entrance." | QR card visible |
| Complete a workout | "Do your assigned workout from start to finish." | Session logged, summary shown |
| Check attendance | "How many days did you attend this month?" | Finds attendance screen |
| Find a badge | "Have you earned any badges? What do they mean?" | Navigates to rewards/badges |
| Receive a push notification | Admin sends test push | Notification received and tappable |
| Install app (Android) | "Add this to your home screen." | App installed, opens standalone |
| Use app offline | Turn off WiFi + mobile data | Card and cached data visible |
| Log a measurement | "Log your weight as 72kg." | Measurement saved, appears in chart |
