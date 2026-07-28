# GymFlow Member PWA — API Specification

**Version:** 1.1
**Base URL:** `https://[project-ref].supabase.co`
**Auth:** All endpoints require `Authorization: Bearer <access_token>` unless marked `[public]`.

> The GymFlow Member PWA uses Supabase PostgREST for CRUD, Supabase Auth for auth, and custom Edge Functions for business logic. This document covers all API surfaces the PWA touches.
>
> **v1 auth method:** Email + Password only. OTP endpoints are not used in v1.

---

## 1. Authentication Endpoints

All auth endpoints use `https://[project-ref].supabase.co/auth/v1`.

### 1.1 Sign In with Password

```
POST /auth/v1/token?grant_type=password
Content-Type: application/json

{
  "email": "member@example.com",
  "password": "••••••••"
}
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "rt_...",
  "expires_in": 3600,
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "member@example.com"
  }
}
```

**Error 400:**
```json
{ "error": "invalid_grant", "error_description": "Invalid login credentials" }
```

### 1.2 Refresh Token

```
POST /auth/v1/token?grant_type=refresh_token
Content-Type: application/json

{ "refresh_token": "rt_..." }
```

**Response 200:** Same shape as 1.1.

### 1.3 Sign Out

```
POST /auth/v1/logout
Authorization: Bearer <access_token>
```

**Response 204:** No content. Client must clear all local caches after this call.

---

## 2. PostgREST Data Endpoints

Base: `https://[project-ref].supabase.co/rest/v1`
All responses are JSON arrays. Use `&limit=1` with `.single()` on the client for single-record fetches.

### 2.1 Member Profile

```
GET /rest/v1/members
  ?auth_user_id=eq.{auth.uid()}
  &select=id,name,email,phone,photo_url,member_code,member_number,gender,date_of_birth,blood_group,
          emergency_name,emergency_phone,medical_notes,gym_id,
          gyms(name,logo_url,brand_color,brand_color_2,timezone)
```

**Response:**
```json
[{
  "id": "uuid",
  "name": "Ganesan M",
  "email": "ganesan@example.com",
  "phone": "+91...",
  "photo_url": "https://...",
  "member_code": "GF-00142",
  "member_number": 142,
  "gender": "male",
  "date_of_birth": "1995-06-14",
  "blood_group": "O+",
  "emergency_name": "Murugan M",
  "emergency_phone": "+9198...",
  "medical_notes": null,
  "gym_id": "uuid",
  "gyms": {
    "name": "FitZone Pondicherry",
    "logo_url": "https://...",
    "brand_color": "#6366F1",
    "brand_color_2": "#8B5CF6",
    "timezone": "Asia/Kolkata"
  }
}]
```

### 2.2 Update Member Profile

```
PATCH /rest/v1/members?auth_user_id=eq.{auth.uid()}
Content-Type: application/json

{
  "emergency_name": "Murugan M",
  "emergency_phone": "+9198...",
  "blood_group": "O+",
  "medical_notes": "Mild lower back pain"
}
```

**Response 204:** No content.

### 2.3 Current Membership

```
GET /rest/v1/memberships
  ?member_id=eq.{member_id}
  &status=eq.active
  &select=*,membership_plans(name,features,duration_days,price)
  &order=end_date.desc
  &limit=1
```

### 2.4 Available Plans for Renewal

```
GET /rest/v1/membership_plans
  ?gym_id=eq.{gym_id}
  &is_active=eq.true
  &select=id,name,duration_days,price,features
  &order=price.asc
```

### 2.5 Payment History

```
GET /rest/v1/payments
  ?member_id=eq.{member_id}
  &order=created_at.desc
  &select=id,amount,payment_mode,status,invoice_number,paid_at,memberships(membership_plans(name))
```

### 2.6 Attendance

```
GET /rest/v1/attendance
  ?member_id=eq.{member_id}
  &date=gte.{month_start}
  &date=lte.{month_end}
  &order=date.desc
  &select=id,date,check_in_at,source,session_type
```

### 2.7 Attendance Streak (RPC)

```
POST /rest/v1/rpc/get_attendance_streak
{ "p_member_id": "uuid" }
```

**Response:** `42` (integer)

### 2.8 Workout Plan (active)

```
GET /rest/v1/workout_plans
  ?member_id=eq.{member_id}
  &is_active=eq.true
  &select=*,workout_days(id,day_number,day_name,workout_exercises(*))
  &order=created_at.desc
  &limit=1
```

### 2.9 Workout Sessions

```
GET /rest/v1/workout_sessions
  ?member_id=eq.{member_id}
  &order=started_at.desc
  &select=*,workout_session_sets(*)
  &limit=20

POST /rest/v1/workout_sessions
{
  "member_id": "uuid",
  "gym_id": "uuid",
  "plan_id": "uuid",
  "day_id": "uuid",
  "started_at": "2026-07-27T08:00:00+05:30"
}

PATCH /rest/v1/workout_sessions?id=eq.{session_id}
{
  "completed_at": "2026-07-27T09:05:00+05:30",
  "duration_min": 65,
  "exercises_done": 8,
  "sets_done": 24,
  "volume_kg": 4320.00
}
```

### 2.10 Workout Session Sets

```
POST /rest/v1/workout_session_sets
{
  "session_id": "uuid",
  "exercise_id": "uuid",
  "set_number": 1,
  "reps_done": 12,
  "weight_done": "20kg",
  "completed": true,
  "completed_at": "2026-07-27T08:15:00+05:30"
}
```

### 2.11 Progress Measurements

```
GET /rest/v1/progress_measurements
  ?member_id=eq.{member_id}
  &order=measured_at.desc
  &select=*

POST /rest/v1/progress_measurements
{
  "member_id": "uuid",
  "gym_id": "uuid",
  "measured_at": "2026-07-27",
  "weight_kg": 72.5,
  "waist_cm": 84
}
```

### 2.12 Diet Plan (active)

```
GET /rest/v1/diet_plans
  ?member_id=eq.{member_id}
  &is_active=eq.true
  &select=*,diet_meals(*)
  &order=created_at.desc
  &limit=1
```

### 2.13 Water Intake

```
-- Get today's intake
GET /rest/v1/water_intake_logs
  ?member_id=eq.{member_id}
  &logged_date=eq.{today}
  &select=glasses

-- Upsert on each glass tap
POST /rest/v1/water_intake_logs
  ?on_conflict=member_id,logged_date
Content-Type: application/json

{
  "member_id": "uuid",
  "gym_id": "uuid",
  "plan_id": "uuid",
  "logged_date": "2026-07-27",
  "glasses": 3
}
```

Note: the client increments `glasses` locally and sends the new total (not a delta). Use `on_conflict=member_id,logged_date` with `Prefer: resolution=merge-duplicates` header.

### 2.14 Notifications

```
GET /rest/v1/notifications
  ?member_id=eq.{member_id}
  &order=sent_at.desc
  &limit=50

-- Mark one as read
PATCH /rest/v1/notifications?id=eq.{notification_id}
{ "is_read": true }

-- Mark all as read
PATCH /rest/v1/notifications?member_id=eq.{member_id}&is_read=eq.false
{ "is_read": true }
```

### 2.15 XP & Level

```
GET /rest/v1/member_xp
  ?member_id=eq.{member_id}
  &gym_id=eq.{gym_id}
  &select=total_xp,level,longest_streak

GET /rest/v1/xp_transactions
  ?member_id=eq.{member_id}
  &order=created_at.desc
  &limit=20
```

### 2.16 Badges

```
-- All badges (for locked/unlocked grid)
GET /rest/v1/badges?select=*

-- Member's earned badges
GET /rest/v1/member_badges
  ?member_id=eq.{member_id}
  &select=*,badges(code,name,description,icon_url,xp_reward)
  &order=earned_at.desc
```

### 2.17 Leaderboard (RPC)

```
POST /rest/v1/rpc/get_leaderboard
{
  "p_gym_id": "uuid",
  "p_type": "weekly_xp",
  "p_limit": 50
}
```

`p_type` values: `weekly_xp` | `monthly_xp` | `alltime_xp` | `weekly_attendance` | `monthly_attendance` | `alltime_attendance`

**Response:**
```json
[
  { "rank": 1, "member_id": "uuid", "name": "Ganesan M", "photo_url": "...", "value": 1250 },
  { "rank": 2, "member_id": "uuid", "name": "Priya K", "photo_url": "...", "value": 980 }
]
```

### 2.18 Challenges

```
GET /rest/v1/challenges
  ?gym_id=eq.{gym_id}
  &ends_at=gte.{today}
  &select=*
  &order=starts_at.asc

GET /rest/v1/challenge_participants
  ?member_id=eq.{member_id}
  &select=*,challenges(*)

POST /rest/v1/challenge_participants
{
  "challenge_id": "uuid",
  "member_id": "uuid"
}
```

### 2.19 Referrals

```
GET /rest/v1/referrals
  ?referrer_id=eq.{member_id}
  &select=id,referral_code,status,created_at,rewarded_at

POST /rest/v1/referrals
{
  "referrer_id": "uuid",
  "gym_id": "uuid",
  "referral_code": "GF-GANE42"
}
```

---

## 3. Edge Functions

Base: `https://[project-ref].supabase.co/functions/v1`

### 3.1 Generate Membership QR

```
POST /functions/v1/generate-qr
Authorization: Bearer <access_token>

{}
```

**Response:**
```json
{
  "qr_payload": "eyJ...",
  "expires_at": "2026-07-27T08:04:00.000Z"
}
```

The QR payload is a short-lived signed JWT: `{ member_id, gym_id, exp: now+5min }`. The Admin Portal validates this signature on scan via a separate `validate-qr` Edge Function.

### 3.2 Push Subscription — Register

```
POST /functions/v1/register-push
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BM...",
    "auth": "xyz..."
  }
}
```

**Response 200:**
```json
{ "success": true }
```

### 3.3 Push Subscription — Unregister

```
DELETE /functions/v1/register-push
Authorization: Bearer <access_token>
Content-Type: application/json

{ "endpoint": "https://..." }
```

### 3.4 Award XP (Internal)

Called by DB triggers and other Edge Functions. Not called directly by the PWA.

```
POST /functions/v1/award-xp
Authorization: Bearer <service_role_key>

{
  "member_id": "uuid",
  "gym_id": "uuid",
  "amount": 100,
  "reason": "workout_complete",
  "ref_type": "workout_sessions",
  "ref_id": "uuid"
}
```

### 3.5 AI Coach Chat (v2 only)

> Not available in v1. Returns 403 if `gym.ai_coach_enabled = false`.

```
POST /functions/v1/ai-coach
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "How many sets for chest day?" }
  ]
}
```

**Response:**
```json
{
  "reply": "For chest day, most beginners benefit from..."
}
```

---

## 4. Realtime Subscriptions

Using `supabase-js` Realtime:

```typescript
// Notifications channel
const notifChannel = supabase
  .channel(`notifications:${memberId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `member_id=eq.${memberId}`
  }, (payload) => {
    showInAppNotification(payload.new);
    invalidateNotificationsCache();
  })
  .subscribe();

// Attendance channel (real-time check-in confirmation after QR scan)
const attendanceChannel = supabase
  .channel(`attendance:${memberId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'attendance',
    filter: `member_id=eq.${memberId}`
  }, (payload) => {
    invalidateAttendanceCache();
    showToast('Check-in recorded!');
  })
  .subscribe();

// XP channel (level-up detection)
const xpChannel = supabase
  .channel(`xp:${memberId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'member_xp',
    filter: `member_id=eq.${memberId}`
  }, (payload) => {
    if (payload.new.level > payload.old.level) {
      triggerLevelUpCelebration(payload.new.level);
    }
    invalidateXpCache();
  })
  .subscribe();

// Announcements channel
const announcementsChannel = supabase
  .channel(`announcements:${gymId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `gym_id=eq.${gymId}&type=eq.announcement`
  }, (payload) => {
    showAnnouncementBanner(payload.new);
  })
  .subscribe();
```

All channels joined on app foreground; closed/paused via Page Visibility API on background.

---

## 5. Error Handling

### HTTP Status Codes

| Code | Meaning | PWA Action |
|---|---|---|
| 200 | Success | Process response |
| 201 | Created | Process, invalidate cache |
| 204 | No content | Success, no body |
| 400 | Bad request | Show validation error |
| 401 | Unauthorised | Refresh token or logout |
| 403 | Forbidden | Show "access denied" |
| 404 | Not found | Show empty state |
| 409 | Conflict | Handle duplicate (idempotent) |
| 422 | Validation failed | Show field errors |
| 429 | Rate limited | Show "please wait X seconds" with `Retry-After` value |
| 500 | Server error | Show retry option |

### Standard Error Body (Supabase PostgREST)

```json
{
  "code": "PGRST301",
  "details": null,
  "hint": null,
  "message": "Row not found"
}
```

### Client-side Error Handling

```typescript
async function apiCall<T>(fn: () => Promise<T>, cacheKey?: string): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (err.status === 401) {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        await supabase.auth.signOut();
        window.location.href = '/login';
        throw err;
      }
      return await fn(); // retry once after refresh
    }
    if (!navigator.onLine && cacheKey) {
      return await readFromIndexedDB(cacheKey);
    }
    throw err;
  }
}
```

---

## 6. Request Rate Limits

| Endpoint Type | Limit |
|---|---|
| Auth (password sign-in) | 10 per hour per IP |
| PostgREST reads | 1,000 per minute per user |
| PostgREST writes | 100 per minute per user |
| Edge Functions | 500 per hour per user |
| AI Coach (v2) | 20 messages per hour per member |

Rate limit errors return HTTP 429 with a `Retry-After` header. The PWA shows a toast: "Too many requests. Try again in X seconds."
