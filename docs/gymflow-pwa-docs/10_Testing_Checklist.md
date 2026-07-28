# GymFlow Member PWA — Testing Checklist

**Version:** 1.1
Legend: ✅ Pass | ❌ Fail | ⚠️ Partial | — Not Applicable

---

## 1. Functional Testing

### 1.1 Authentication

| Test | Expected | Status |
|---|---|---|
| Login with valid email + password | Redirect to home | |
| Login with invalid password | "Incorrect password" shown, no redirect | |
| Login with unregistered email | "Account not found. Contact your gym." shown | |
| 5 wrong password attempts | Account locked, "try again in 15 min" message | |
| Session persists after browser close | Still logged in on reopen | |
| Session expires → auto-refresh | Continues working without prompt | |
| Refresh token expired → redirect to login | Redirected, all caches cleared | |
| Manual logout | Redirected to login, Dexie + TanStack + SW cache cleared | |
| Login on second device | Both sessions work simultaneously | |

### 1.2 Home Dashboard

| Test | Expected | Status |
|---|---|---|
| Welcome message — morning (00:00–11:59) | "Good Morning, [Name]" | |
| Welcome message — afternoon (12:00–17:59) | "Good Afternoon, [Name]" | |
| Welcome message — evening (18:00–23:59) | "Good Evening, [Name]" | |
| Gym logo displayed | Gym's logo from Supabase Storage | |
| Brand colour applied | UI CSS variables match gym's brand_color (default `#2563EB`) | |
| Theme matches main web app | Light shell, blue brand, Sora — side-by-side check against the owner web app | |
| Auth screens use the dark shell | slate-950 bg + orbs + grid, matching web app login | |
| Membership > 14 days: green status | Green/brand gradient indicator | |
| Membership 7–14 days: amber status | Amber/warning indicator | |
| Membership < 7 days: red status | Red/error indicator | |
| Expired membership: banner shown | "Membership expired. Renew now." with CTA | |
| Streak counter correct | Matches result of `get_attendance_streak` RPC | |
| Dashboard loads within 2s on first load | Measured with DevTools Network throttle | |
| All widgets render without console errors | No errors in DevTools console | |

### 1.3 Digital Membership Card

| Test | Expected | Status |
|---|---|---|
| Card displays all member info | Name, member_code, plan, expiry, photo | |
| member_code shown in monospace font | "GF-00142" style, `--font-mono` | |
| Initials avatar shown when no photo | First+last initial, brand background | |
| QR code renders and is scannable | Scan with external device camera | |
| QR code auto-refreshes every 4 minutes | New payload without page reload | |
| QR code works offline (last cached) | Cached payload shown | |
| Screen wake lock activates | Screen stays on without tapping | |
| Wake lock releases on back navigation | Screen can sleep again | |
| Expired membership: warning on card | "Expired" badge shown | |

### 1.4 Attendance

| Test | Expected | Status |
|---|---|---|
| Calendar shows present days | Filled circles in brand colour | |
| Calendar shows absent days | Empty circles | |
| Today highlighted correctly | Outlined circle with focus ring | |
| Tapping a day shows check-in time and source | Bottom sheet with time + source | |
| Month navigation (prev/next) | Calendar re-renders for selected month | |
| Streak correct after today's visit | Increments by 1 | |
| Streak breaks after missed day | Resets from next visit day | |
| Longest streak never decreases | `member_xp.longest_streak` retained after break | |
| Monthly attendance percentage correct | (present_days / working_days) × 100 | |

### 1.5 Membership Screen

| Test | Expected | Status |
|---|---|---|
| Plan name and dates displayed | Correct data from DB | |
| Benefits list rendered | All strings from `membership_plans.features` JSONB | |
| Payment status shown | Paid / Pending badge | |
| Renew button hidden when > 14 days | Button not visible | |
| Renew button shown when ≤ 14 days or expired | Button visible + functional | |
| Tap plan in renewal sheet | WhatsApp / phone link opens | |

### 1.6 Payments

| Test | Expected | Status |
|---|---|---|
| Payment history loads | All records shown, newest first | |
| Each record: date, amount, mode, status shown | Correct data | |
| Invoice PDF download | PDF opens with gym letterhead + details | |
| Invoice: invoice_number shown | Unique invoice number correct | |
| Pending payment banner shown | Warning banner with ₹ amount | |
| Empty state (no payments) | "No payment history yet" shown | |

### 1.7 Workout Module

| Test | Expected | Status |
|---|---|---|
| Assigned plan loads correctly | Correct exercises, sets, reps per day | |
| Current day highlighted in plan overview | Correct day based on day_of_week | |
| No plan: empty state shown | "No workout plan yet. Ask your trainer." | |
| "Start Workout" creates session record | `workout_sessions` row with `started_at` | |
| Completing a set marks checkbox | Visual feedback, row bg shifts to success | |
| Rest timer starts after set completion | Countdown begins | |
| Rest timer can be skipped | Skip button advances past countdown | |
| Haptic on set completion | `navigator.vibrate([15])` fires | |
| Swipe navigation between exercises | Swipe left → next exercise | |
| Progress indicator updates | "3 / 8" increments correctly | |
| End workout prompts confirmation | Elevation 4 dialog shown | |
| Partial completion count in dialog | "You've completed 6/8 exercises" | |
| Confirming end workout updates session | `completed_at`, `exercises_done`, `sets_done`, `volume_kg` set | |
| XP awarded on completion | XP transaction created, animated +100 XP float | |
| Workout summary shows volume | Estimated volume in kg shown | |
| Workout history lists completed sessions | Sorted newest first | |
| App backgrounded mid-workout | Session remains open on return | |
| Offline workout tracking | Sets saved to Dexie sync queue | |
| Come back online → sync queue uploads | Sets appear in Supabase | |
| Force quit mid-workout | Recovery prompt on next open | |

### 1.8 Progress Tracking

| Test | Expected | Status |
|---|---|---|
| Log measurement — only date required | Saves successfully with other fields empty | |
| Log measurement — all fields | All values stored in `progress_measurements` | |
| XP awarded for measurement (first per week) | 30 XP transaction created | |
| XP not awarded twice in same week | No duplicate XP for second measurement | |
| Weight chart renders | Line chart with correct data points | |
| Time range toggle works | Chart re-renders for 7d / 30d / 90d / All | |
| Upload progress photo — camera | Photo captured and uploaded to Storage | |
| Upload progress photo — gallery | Photo selected and uploaded | |
| Photo gallery shows all photos | Chronological grid, newest first | |
| Full-screen photo on tap | Lightbox with date label | |
| Empty state when no measurements | Illustration + "Log your first measurement" CTA | |

### 1.9 Diet Plan

| Test | Expected | Status |
|---|---|---|
| Active plan loads | Plan name, macros, meals shown | |
| Meals sorted correctly | Breakfast → Lunch → Snacks → Dinner | |
| Macro summary shows all values | Calories, protein, carbs, fats, water target | |
| Water tracker shows today's glasses | Reads from `water_intake_logs` for today | |
| Tap glass icon increments count | Glasses count increments; UPSERT fires | |
| Water tracker resets next day | New day = 0 glasses | |
| No plan empty state | "Your trainer hasn't created a diet plan yet." | |

### 1.10 Notifications

| Test | Expected | Status |
|---|---|---|
| Notification list loads | All notifications shown, newest first | |
| Unread notifications have indicator | Unread dot visible | |
| Tapping notification marks as read | Dot removed; `is_read` updated in DB | |
| "Mark all read" clears all unread | All dots removed | |
| Tapping notification navigates correctly | `data.link` deep link opens | |
| Push permission prompt shown on first login | Browser permission dialog appears | |
| Push permission granted → subscription saved | Row in `push_subscriptions` | |
| Push notification received when app closed | OS notification shown | |
| Tapping push notification opens app | Correct screen opened via `url` data | |
| In-app toast for new notification | Banner appears while app is foreground | |

### 1.11 Gamification

| Test | Expected | Status |
|---|---|---|
| XP awarded after attendance check-in | +50 XP within 5s via Realtime | |
| XP awarded after workout completion | +100 XP shown in activity feed | |
| XP total updates without page refresh | Realtime channel fires | |
| Level calculation correct | Level matches XP threshold table | |
| Level up triggers celebration overlay | Full-screen animation + confetti | |
| Level up notification created | Appears in notification centre | |
| Badge earned on first workout | "First Rep" badge appears in grid | |
| Badge earned on 7-day streak | "Week Warrior" badge appears | |
| Longest streak updates in member_xp | `longest_streak` column updated | |
| Badge grid: earned in colour | Full colour, no lock icon | |
| Badge grid: unearned greyscale | Greyscale + lock icon shown | |
| Tapping earned badge shows detail sheet | Name, description, XP, earned date | |
| Tapping locked badge shows how-to-earn | Earn criteria shown | |
| Leaderboard shows top 50 members | List with rank, name, photo, value | |
| Current member shown if outside top 50 | Sticky row at bottom of leaderboard | |
| Leaderboard tabs switch correctly | Weekly / Monthly / All-time data loads | |
| Challenge list shows active challenges | Correct challenges for gym | |
| Join challenge creates participant row | `challenge_participants` row inserted | |
| Challenge progress updates after attendance | Auto-tracked progress bar increments | |
| Completed challenge shows ✓ and XP | Badge + "Completed! +XXX XP" shown | |
| Referral code unique per member | Different from other members | |
| Share referral opens native share | Web Share API sheet shown | |
| Referral link uses correct domain | `https://member.gymflow.sbs/join?ref=...` | |

### 1.12 Profile

| Test | Expected | Status |
|---|---|---|
| Profile loads with all fields | Name, email, phone, DOB, gender, blood group | |
| Inline edit name → save | `members` record updated; UI reflects | |
| Blood group field saves | Stored in `members.blood_group` | |
| Emergency contact save | `emergency_name` + `emergency_phone` stored | |
| Medical notes save | `medical_notes` stored | |
| Update profile photo | New photo shown; Storage URL updated | |
| Notification settings toggles visible | Per-type toggles displayed | |

---

## 2. Offline Testing

| Test | Expected | Status |
|---|---|---|
| Go offline → open app | App loads (service worker cache) | |
| Membership card shown offline | Cached QR payload displayed | |
| Attendance calendar shown offline | Cached data shown | |
| Workout plan shown offline | Cached plan shown | |
| Notifications shown offline | Cached notifications shown | |
| Log workout set offline | Saved to Dexie sync queue | |
| Come back online → sync queue processed | Sets uploaded to Supabase | |
| Offline indicator shown | "Offline" toast or banner | |
| Leaderboard not available offline | "Available when online" shown | |
| Water intake tap offline | Saved locally; synced on reconnect | |

---

## 3. PWA Testing

### 3.1 Installability

| Test | Expected | Status |
|---|---|---|
| Chrome: install banner appears | After 2+ visits, fewer than 2 dismissals | |
| Install banner dismissed twice → stops showing | Banner not shown again | |
| Android: install from Chrome | App installs to home screen | |
| Installed app opens in standalone mode | No browser UI visible | |
| iOS: add to home screen instructions shown | Modal with Safari share steps | |
| iOS: installed app opens standalone | No Safari browser bar | |
| App shortcuts (Home Screen / Start Workout) | Shortcut opens correct route | |

### 3.2 Service Worker

| Test | Expected | Status |
|---|---|---|
| Service worker registered | DevTools → Application → SW shows active | |
| Static assets cached after first load | Cache Storage shows JS/CSS/fonts | |
| API responses cached (NetworkFirst) | Supabase responses in `supabase-api` cache | |
| New SW detected → update toast shown | "GymFlow updated! Refresh for the latest version." | |
| Refresh after update activates new SW | New version confirmed in DevTools | |

### 3.3 Lighthouse Scores

Run `lighthouse https://member.gymflow.sbs` in Chrome DevTools:

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
| JWT manipulation (edit payload) | Rejected by Supabase with 401 | |
| QR code replay after expiry | "Expired QR" error from validate-qr Edge Function | |
| Sensitive data in service worker cache | No PII in SW cache storage | |
| HTTPS enforced | HTTP redirects to HTTPS | |
| Expired session: API call | 401 returned; auto-refresh attempted | |
| `water_intake_logs` RLS: member can only write own rows | PATCH for another member_id blocked | |

---

## 6. Accessibility Testing

| Test | Expected | Status |
|---|---|---|
| Screen reader: VoiceOver (iOS) | All interactive elements announced | |
| Screen reader: TalkBack (Android) | All interactive elements announced | |
| Keyboard navigation (desktop) | All elements reachable via Tab | |
| Focus ring visible on all interactive elements | `--focus-ring` box-shadow present | |
| Colour contrast: body text | ≥ 4.5:1 (`--color-text-primary` #0F172A on white ≈ 17.9:1) | |
| Colour contrast: secondary text | ≥ 4.5:1 (`--color-text-secondary` #475569 on white ≈ 7.4:1) | |
| Colour contrast: white on brand | ≥ 4.5:1 (white on `--color-brand` #2563EB ≈ 5.2:1) | |
| Colour contrast: status triads | ≥ 4.5:1 (each `-700` text on its `-50` bg) | |
| `--color-text-muted` not used for body copy | Only timestamps, placeholders, inactive nav labels | |
| Focus ring meets WCAG 2.4.11 | Verify `--color-brand-400` ring on white; escalate to `brand-500` if it fails | |
| Custom `brand_color` contrast guard | Gym-supplied colour darkened until it clears 4.5:1 on white | |
| Touch targets ≥ 44×44px | No small tappable areas (workout sets: 56px min) | |
| Font size 200%: layout intact | No overflow, no broken layouts | |
| `prefers-reduced-motion` respected | All CSS animations collapsed to 0.01ms | |
| ARIA labels on icon-only buttons | `aria-label` present | |
| XP gain announced to screen reader | `role="status"` live region fires | |
| Badge earned announced | `role="alert"` live region fires | |
| Progress bars labelled | `role="progressbar"` with `aria-valuenow/min/max` | |

---

## 7. Cross-browser / Cross-device Testing

| Device / Browser | Auth | Dashboard | Card | Workout | Push Notif |
|---|---|---|---|---|---|
| Android 12 — Chrome 124 | | | | | |
| Android 12 — Firefox | | | | — (no push) | |
| Android 12 — Samsung Browser | | | | | |
| iOS 17 — Safari | | | | | |
| iOS 16.4 — Safari | | | | | (16.4+ min for Web Push) |
| iOS 16.3 — Safari | | | | | — (no Web Push; show fallback) |
| iPhone SE (375px) | | | | | |
| iPad (768px) | | | | | |
| Desktop — Chrome (Windows) | | | | | |
| Desktop — Chrome (Mac) | | | | | |
| Desktop — Safari (Mac) | | | | — | |
| Desktop — Firefox | | | | — | |

---

## 8. User Acceptance Testing (UAT) Scenarios

Conduct with 3–5 real gym members before launch.

| Scenario | Tester Instruction | Pass Criteria |
|---|---|---|
| First login | "Log in using the link/code your gym gave you." | Logged in, home shown |
| Find membership info | "How many days are left on your membership?" | Finds it within 30 seconds |
| Show QR for attendance | "Show the QR code you'd use at the gym entrance." | QR card visible and scannable |
| Complete a workout | "Do your assigned workout from start to finish." | Session logged, summary + XP shown |
| Check attendance | "How many days did you attend this month?" | Finds attendance screen, correct count |
| Find a badge | "Have you earned any badges? What do they mean?" | Navigates to rewards/badges, taps one |
| Log your weight | "Log your weight as 72kg." | Measurement saved, appears in chart |
| Track water intake | "Log 4 glasses of water from your diet plan." | 4 glasses shown in tracker |
| Receive a push notification | Gym owner sends test push | Notification received and tappable |
| Install app (Android) | "Add this to your home screen." | App installed, opens standalone |
| Use app offline | Turn off WiFi + mobile data | Card and cached data visible |
