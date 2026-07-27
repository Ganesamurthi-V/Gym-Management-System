# GymFlow Member PWA — API Specification

**Version:** 1.0  
**Base URL:** `https://[project-ref].supabase.co`  
**Auth:** All endpoints require `Authorization: Bearer <access_token>` unless marked `[public]`.

> The GymFlow Member PWA uses Supabase PostgREST for CRUD, Supabase Auth for auth, and custom Edge Functions for business logic. This document covers all API surfaces the PWA touches.

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

### 1.2 Phone OTP — Send

```
POST /auth/v1/otp
Content-Type: application/json

{
  "phone": "+919876543210"
}
```

**Response 200:** `{}`

### 1.3 Phone OTP — Verify

```
POST /auth/v1/verify
Content-Type: application/json

{
  "phone": "+919876543210",
  "token": "123456",
  "type": "sms"
}
```

**Response 200:** Same shape as 1.1.

### 1.4 Refresh Token

```
POST /auth/v1/token?grant_type=refresh_token
Content-Type: application/json

{ "refresh_token": "rt_..." }
```

### 1.5 Sign Out

```
POST /auth/v1/logout
Authorization: Bearer <access_token>
```

---

## 2. PostgREST Data Endpoints

Base: `https://[project-ref].supabase.co/rest/v1`  
All responses are JSON arrays (even single records unless using `.single()`).

### 2.1 Member Profile

```
GET /rest/v1/members?id=eq.{member_id}&select=*,gyms(name,logo_url,brand_color,brand_color_2,timezone)
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
PATCH /rest/v1/members?id=eq.{member_id}
Content-Type: application/json

{
  "emergency_name": "Murugan M",
  "emergency_phone": "+9198..."
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

### 2.4 Payment History

```
GET /rest/v1/payments
  ?member_id=eq.{member_id}
  &order=created_at.desc
  &select=id,amount,payment_mode,status,invoice_number,paid_at,memberships(membership_plans(name))
```

### 2.5 Attendance

```
GET /rest/v1/attendance
  ?member_id=eq.{member_id}
  &date=gte.{month_start}
  &date=lte.{month_end}
  &order=date.desc
  &select=id,date,check_in_at,source
```

### 2.6 Workout Plan (active)

```
GET /rest/v1/workout_plans
  ?member_id=eq.{member_id}
  &is_active=eq.true
  &select=*,workout_days(id,day_number,day_name,workout_exercises(*))
  &order=created_at.desc
  &limit=1
```

### 2.7 Workout Sessions

```
GET /rest/v1/workout_sessions
  ?member_id=eq.{member_id}
  &order=started_at.desc
  &select=*,workout_session_sets(*)
  &limit=20
```

```
POST /rest/v1/workout_sessions
{
  "member_id": "uuid",
  "gym_id": "uuid",
  "plan_id": "uuid",
  "day_id": "uuid",
  "started_at": "2026-07-27T08:00:00+05:30"
}
```

```
PATCH /rest/v1/workout_sessions?id=eq.{session_id}
{
  "completed_at": "2026-07-27T09:05:00+05:30",
  "duration_min": 65
}
```

### 2.8 Workout Session Sets

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

### 2.9 Progress Measurements

```
GET /rest/v1/progress_measurements
  ?member_id=eq.{member_id}
  &order=measured_at.desc
  &select=*
```

```
POST /rest/v1/progress_measurements
{
  "member_id": "uuid",
  "gym_id": "uuid",
  "measured_at": "2026-07-27",
  "weight_kg": 72.5,
  "waist_cm": 84
}
```

### 2.10 Notifications

```
GET /rest/v1/notifications
  ?member_id=eq.{member_id}
  &order=sent_at.desc
  &limit=50
```

```
PATCH /rest/v1/notifications?member_id=eq.{member_id}&is_read=eq.false
{ "is_read": true }
```

### 2.11 XP & Level

```
GET /rest/v1/member_xp
  ?member_id=eq.{member_id}
  &gym_id=eq.{gym_id}
  &select=total_xp,level
```

```
GET /rest/v1/xp_transactions
  ?member_id=eq.{member_id}
  &order=created_at.desc
  &limit=20
```

### 2.12 Badges

```
-- All badges (earned + unearned)
GET /rest/v1/badges?select=*

-- Member's earned badges
GET /rest/v1/member_badges
  ?member_id=eq.{member_id}
  &select=*,badges(code,name,description,icon_url)
```

### 2.13 Leaderboard

```
-- Leaderboard is a DB view or RPC for performance
POST /rest/v1/rpc/get_leaderboard
{
  "p_gym_id": "uuid",
  "p_type": "weekly_xp",  -- weekly_xp | monthly_xp | alltime_xp | weekly_attendance
  "p_limit": 50
}
```

**Response:**
```json
[
  { "rank": 1, "member_id": "uuid", "name": "Ganesan M", "photo_url": "...", "value": 1250 },
  { "rank": 2, "member_id": "uuid", "name": "Priya K", "photo_url": "...", "value": 980 }
]
```

### 2.14 Challenges

```
GET /rest/v1/challenges
  ?gym_id=eq.{gym_id}
  &ends_at=gte.{today}
  &select=*

GET /rest/v1/challenge_participants
  ?member_id=eq.{member_id}
  &select=*,challenges(*)

POST /rest/v1/challenge_participants
{
  "challenge_id": "uuid",
  "member_id": "uuid"
}
```

### 2.15 Diet Plan

```
GET /rest/v1/diet_plans
  ?member_id=eq.{member_id}
  &is_active=eq.true
  &select=*,diet_meals(*)
  &order=created_at.desc
  &limit=1
```

### 2.16 Referrals

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
  "qr_payload": "eyJ...",   // Signed JWT payload
  "expires_at": "2026-07-27T08:04:00.000Z"
}
```

The QR payload is a short-lived signed JWT containing `{ member_id, gym_id }`. The Admin Portal validates this signature on scan.

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

Called by other Edge Functions and DB triggers. Not called directly by PWA.

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

### 3.5 AI Coach Chat

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
const channel = supabase
  .channel(`notifications:${memberId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `member_id=eq.${memberId}`
  }, (payload) => {
    showInAppNotification(payload.new);
  })
  .subscribe();

// Attendance channel (for real-time check-in confirmation)
const attendanceChannel = supabase
  .channel(`attendance:${memberId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'attendance',
    filter: `member_id=eq.${memberId}`
  }, (payload) => {
    invalidateAttendanceCache();
    awardCheckInXP();
  })
  .subscribe();

// XP channel (for level-up detection)
const xpChannel = supabase
  .channel(`xp:${memberId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'member_xp',
    filter: `member_id=eq.${memberId}`
  }, (payload) => {
    if (payload.new.level > payload.old.level) triggerLevelUpCelebration();
  })
  .subscribe();
```

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
| 429 | Rate limited | Show "please wait" |
| 500 | Server error | Show retry option |

### Standard Error Body (Supabase)

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
async function apiCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err.status === 401) {
      await supabase.auth.refreshSession();
      return await fn(); // retry once
    }
    if (!navigator.onLine) {
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
| Auth (OTP send) | 5 per hour per phone |
| Auth (password) | 10 per hour per IP |
| PostgREST reads | 1000 per minute per user |
| PostgREST writes | 100 per minute per user |
| Edge Functions | 500 per hour per user |
| AI Coach | 20 messages per hour per member |

Rate limit errors return HTTP 429 with `Retry-After` header.
