# GymFlow Member PWA — Feature Specifications

**Version:** 1.0  

---

## 1. Authentication

### 1.1 Email + Password Login

**Flow:**
1. Member enters email → system checks if account exists.
2. If new: system sends a secure password setup link (no registration form).
3. If existing: enter password → validate → receive JWT.
4. On success: store session → redirect to Home.

**Edge cases:**
- Wrong password: show "Incorrect password" after 1st attempt; lock for 15 min after 5 failures.
- Unverified email: show "Please verify your email" with resend option.
- Deleted account: show "Account not found. Contact your gym."

### 1.2 Phone OTP Login

**Flow:**
1. Member enters phone number (Indian: auto-prefix +91).
2. System sends 6-digit OTP via SMS.
3. OTP input (6 boxes, auto-advance on each digit).
4. Auto-submit when 6th digit entered.
5. OTP valid for 10 minutes. Resend allowed after 30 seconds.

**Edge cases:**
- Wrong OTP: "Incorrect code. X attempts remaining." Block after 5 failures.
- Expired OTP: show resend button immediately.
- Phone not registered: "No account found. Ask your gym to add you."

### 1.3 Session Management

- Auto-refresh JWT silently in background before expiry.
- If refresh fails (revoked/expired): clear local session → redirect to login.
- Multi-device: login on new device does NOT log out other devices.
- Manual logout: clear all local storage, IndexedDB cache, service worker cache.

---

## 2. Home Dashboard

### 2.1 Welcome Banner
- "Good Morning/Afternoon/Evening, [First Name]"
- Shows gym logo top-right.
- Background uses gym brand gradient.

### 2.2 Membership Status Card
- Plan name, expiry date, days remaining.
- Progress bar showing days consumed vs total.
- Colour coding: green / amber / red based on urgency.
- Tap → navigate to Membership screen.
- If expired: banner "Membership expired. Renew now" with CTA.

### 2.3 Today's Workout Preview
- Shows day name and first 3 exercises.
- "Start Workout" button.
- If no plan assigned: "No workout plan yet. Ask your trainer."
- If already completed today: "Workout done! ✓ Great job."

### 2.4 Attendance Summary
- Current streak (flame icon + number).
- Attendance this month (e.g., "18 / 26 days").
- Tap → navigate to Attendance screen.

### 2.5 XP Progress Widget
- Current level badge.
- XP bar showing progress to next level.
- Tap → navigate to Rewards screen.

### 2.6 Motivation Quote
- Rotates daily from a curated list of 100+ gym/fitness quotes.
- Seed from `day_of_year % quotes.length`.

### 2.7 Recent Notifications
- Latest 3 unread notifications.
- "See all" link.

### 2.8 Gym Announcements
- Latest active announcement displayed as a banner.
- Dismissible (stored in localStorage).

---

## 3. Digital Membership Card

### 3.1 Display
- Full portrait card layout.
- Gym logo top-centre.
- Member photo (circle, 80px).
- Member name (H2).
- Member ID (monospace font, e.g. "GF-00142").
- Plan name + expiry date.
- QR code (256×256px minimum).

### 3.2 QR Code
- Payload: signed JWT containing `{ member_id, gym_id, exp: now+5min }`.
- New QR generated every 4 minutes (rotating for security).
- QR shown even offline (last valid QR cached).

### 3.3 Validation (Admin side)
- Admin scans QR → Edge Function validates signature → records attendance.
- If expired QR: show "QR expired — ask member to refresh."

### 3.4 Screen Brightness
- On mount: request wake lock + set brightness to max (where API permits).
- On unmount: restore brightness + release wake lock.

---

## 4. Attendance

### 4.1 Calendar View
- Monthly calendar grid.
- Present days: filled circle in brand colour.
- Absent days: empty circle.
- Today: outlined circle.
- Tap a day → show check-in time (if available).

### 4.2 Summary Stats
- Current streak / longest streak.
- Total visits (all time).
- This month: present / working days.
- Attendance percentage (this month).

### 4.3 Weekly View
- Bar chart (Mon–Sun) for current week.
- Comparison bar: last week.

### 4.4 Streak Rules
- Streak increments if member attended on the previous calendar day.
- Streak breaks if a day is missed (no grace day in v1).
- Longest streak stored separately — never decrements.

**Edge cases:**
- Member travels / sick leave: no special handling in v1; streak breaks naturally.
- Same-day duplicate punch (biometric): idempotent — only one attendance record per (member, date, session_type).

---

## 5. Membership Screen

### 5.1 Display
- Plan name, joining date, expiry date, remaining days.
- Full list of plan benefits (from `membership_plans.features` JSONB).
- Payment status (paid / pending).
- "Renew" button (shown when ≤14 days remaining or expired).

### 5.2 Renewal
- Tap "Renew" → show available plans for their gym.
- Plan card: name, duration, price.
- Tap plan → redirect to WhatsApp / payment link (as configured by gym).
- In v1: renewal is offline — member contacts gym; button opens contact.

---

## 6. Payments Screen

### 6.1 Payment History
- Chronological list, newest first.
- Each item: date, amount, mode, invoice number, status badge.

### 6.2 Invoice Download
- Tap payment → show detail sheet.
- "Download Invoice" button → generate PDF client-side via jsPDF.
- Invoice includes: gym letterhead, member details, plan, payment mode, amount.

### 6.3 Pending Dues
- If `payments` has pending records: show "You have a pending payment of ₹XXXX" warning banner.

---

## 7. Workout Module

### 7.1 Plan Overview
- Plan name + goal.
- List of workout days (Day 1 through Day N).
- Current day highlighted.

### 7.2 Day View
- Day name + exercise list.
- Each exercise: name, sets × reps, weight, rest time, notes (expandable).

### 7.3 Active Workout Session

**Start:**
- Tap "Start Workout" → create `workout_sessions` record.
- Show first exercise.

**Per Exercise:**
- Exercise name + instructions.
- Set rows: set number, target reps, target weight, done checkbox.
- Start timer: tap set to start rest countdown after completing.
- Rest countdown: full-screen countdown with skip button.

**Navigation:**
- Swipe or tap "Next Exercise".
- Progress indicator: "Exercise 3 / 8".

**End:**
- Tap "Finish Workout".
- Confirmation: "Are you sure? You've completed 6/8 exercises."
- On confirm: mark session complete, award XP, show summary.

**Summary screen:**
- Duration, exercises done, sets completed, estimated volume.
- XP earned (animated).
- "Share" (future).

**Edge cases:**
- App goes background mid-workout → session stays open (no timeout in v1).
- Offline mid-workout → writes to sync queue; syncs when back online.
- Force-quit → on next open, detect incomplete session, offer to resume or discard.

### 7.4 Workout History
- List of completed sessions, newest first.
- Each: date, duration, exercises done, XP earned.
- Tap → see set details.

---

## 8. Diet Plans Screen

### 8.1 Active Plan View
- Plan name + macro summary (calories, protein, carbs, fats, water).
- Meals listed in order: Breakfast → Lunch → Snacks → Dinner.
- Each meal: name, description, macro breakdown.
- Water intake tracker (tap to increment glasses).

### 8.2 No Plan State
- "Your trainer hasn't created a diet plan yet."
- Contact trainer button.

---

## 9. Progress Tracking

### 9.1 Log Measurement
- Form: weight, body fat %, chest, waist, hips, arms, shoulders, thighs.
- All fields optional except date.
- Tap "Save" → inserts to `progress_measurements`.

### 9.2 Charts
- Weight chart: line chart (30d default).
- Body composition: grouped bar or line.
- Measurements: one chart per measurement type (tabs or scroll).
- Time range toggle: 7d / 30d / 90d / All.

### 9.3 Progress Photos
- Upload: tap + → choose from gallery or camera.
- Types: Before / Progress / After.
- Gallery: chronological grid.
- Tap photo → full-screen with date label.

**Privacy:** photos stored in Supabase Storage under `member-photos/{member_id}/` with RLS.

---

## 10. Notifications

### 10.1 In-App Notification Centre
- Bell icon in top-right of Home with unread count badge.
- List: newest first.
- Each: icon (by type), title, body, timestamp, unread indicator.
- Tap → mark as read + navigate to relevant screen via `data.link`.
- "Mark all read" button at top.

### 10.2 Push Notifications
- On first login: prompt for push permission (with friendly explanation).
- On permission grant: generate Web Push subscription → save to `push_subscriptions`.
- On denial: do not ask again, allow opt-in later from Profile > Settings.

### 10.3 Notification Types and Actions

| Type | Trigger | Deep Link |
|---|---|---|
| Membership expiring | 14 days, 7 days, 3 days, 1 day before | /membership |
| Payment due | When pending payment created | /payments |
| Workout assigned | New plan linked to member | /workout |
| Diet plan updated | Plan modified | /diet |
| Gym announcement | Admin publishes announcement | /home |
| Challenge started | Challenge start date | /rewards/challenges |
| Badge earned | Badge trigger fires | /rewards/badges |
| XP milestone | Level up | /rewards |
| System | Admin message | /notifications |

---

## 11. Profile

### 11.1 Personal Details
- Name, email, phone, date of birth, gender, blood group.
- Tap field → inline edit → save.
- Photo: tap avatar → choose camera or gallery.

### 11.2 Emergency Contact
- Name, phone.
- Shown to gym staff in emergency.

### 11.3 Medical Notes
- Free text.
- Visible to trainer when viewing member profile in admin.

### 11.4 Settings
- Push notification preferences (toggle per type).
- Biometric login (device permitting, future).
- Language preference (future).

### 11.5 Privacy
- "Download my data" — exports member data as JSON.
- "Delete account" — sends request to gym admin (cannot self-delete in v1).

### 11.6 Logout
- Confirmation dialog.
- Clear all cached data.
- Redirect to login.

---

## 12. Referral Program

### 12.1 My Referral Code
- Unique code displayed (e.g. "GF-GANE42").
- Share button: copies link or opens native share sheet.
- Link: `https://member.gymflow.in/join?ref=GF-GANE42`

### 12.2 Referral Status
- List of referrals: name (partial, for privacy), status (pending / joined / rewarded), date.
- "Invited X friends, Y joined."

### 12.3 Referral Joining
- New member opens referral link → pre-fills referral code at registration.
- On first payment: both referrer and referred receive XP reward.

---

## 13. AI Coach (Premium)

### 13.1 Chat Interface
- Standard chat UI (messages bubble layout).
- System prompt: member's current plan, progress, goals, gym name.
- Member can ask: workout advice, nutrition questions, exercise form, motivation.

### 13.2 Access Control
- Feature flag per gym (premium tier).
- If not available: show locked state with "Ask your gym to enable AI Coach."

### 13.3 Data Passed to AI
- Current workout plan name + exercises.
- Latest 3 measurements.
- Membership goal.
- No PII beyond first name.
