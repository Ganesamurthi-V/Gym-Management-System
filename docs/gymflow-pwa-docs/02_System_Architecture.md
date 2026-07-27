# GymFlow Member PWA — System Architecture

**Version:** 1.0  
**Status:** Planning  

---

## 1. Architecture Overview

GymFlow Member PWA is a client-side Progressive Web App that communicates exclusively with the GymFlow Supabase backend. There is no separate API server — all data access goes through Supabase's PostgREST, Auth, Storage, and Realtime layers, protected by Row-Level Security.

```
┌─────────────────────────────────────────────────────┐
│                  Member PWA (Browser/PWA)            │
│  Next.js 15 App Router  ·  TypeScript  ·  Tailwind  │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS / WSS
        ┌────────────────▼──────────────────┐
        │          Supabase Platform         │
        │  ┌──────────┐  ┌───────────────┐  │
        │  │  Auth     │  │  PostgREST    │  │
        │  │  (JWT)    │  │  (REST API)   │  │
        │  └──────────┘  └───────────────┘  │
        │  ┌──────────┐  ┌───────────────┐  │
        │  │ Realtime  │  │   Storage     │  │
        │  │ (WS)      │  │  (S3-compat)  │  │
        │  └──────────┘  └───────────────┘  │
        │  ┌──────────────────────────────┐  │
        │  │   PostgreSQL + RLS Policies   │  │
        │  └──────────────────────────────┘  │
        └───────────────────────────────────┘
                         │
        ┌────────────────▼──────────────────┐
        │         GymFlow Admin Portal       │
        │   (Next.js 15 · same Supabase)    │
        └───────────────────────────────────┘
```

The main web app and Member PWA share the same Supabase project. RLS policies ensure members can only access their own gym's data, and only their own records within that gym.

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Next.js 15 App Router | SSG/ISR for performance, PWA-ready |
| Language | TypeScript | Type safety across the entire codebase |
| Styling | Tailwind CSS + shadcn/ui | Consistent design system |
| State | Zustand | Lightweight global state for offline-first |
| Data Fetching | TanStack Query v5 | Cache, background sync, optimistic updates |
| Backend | Supabase (hosted) | Auth, DB, Storage, Realtime, RLS |
| PWA | next-pwa / Workbox | Service worker, caching, install prompt |
| Push Notifications | Web Push API + Supabase Edge Functions | Push via VAPID keys |
| QR Code | qrcode.js | Digital membership card |
| Charts | Recharts | Progress and attendance visualizations |
| Offline DB | IndexedDB (via Dexie.js) | Offline data persistence |

---

## 3. Application Layers

```
┌─────────────────────────────────────────────┐
│                    UI Layer                  │
│   Pages · Screens · Components · Animations │
├─────────────────────────────────────────────┤
│               State & Cache Layer            │
│   TanStack Query · Zustand · Optimistic UI  │
├─────────────────────────────────────────────┤
│               Service Layer                  │
│   API wrappers · Supabase client · Auth     │
├─────────────────────────────────────────────┤
│               Offline Layer                  │
│   Dexie.js IndexedDB · Sync Queue           │
├─────────────────────────────────────────────┤
│               PWA Layer                      │
│   Service Worker · Cache API · Push         │
└─────────────────────────────────────────────┘
```

---

## 4. Authentication Flow

```
Member opens PWA
       │
       ▼
Check local JWT (Supabase session)
       │
   ┌───┴──────┐
   │ Valid?   │
   └───┬──────┘
       │ Yes → load app with stored session
       │ No  →
       ▼
Auth Screen
├── Email + Password
│     └── POST /auth/v1/token?grant_type=password
├── Phone OTP
│     ├── POST /auth/v1/otp  (send OTP)
│     └── POST /auth/v1/verify (verify code)
└── Magic Link (Future)
       │
       ▼
Supabase returns access_token + refresh_token
       │
       ▼
Store in secure httpOnly cookie (or supabase-js localStorage)
Auto-refresh before expiry
```

**Multi-device:** Supabase manages sessions per device. Members can be logged in on phone + desktop simultaneously.

**Session duration:** Access token: 1 hour. Refresh token: 30 days. Auto-refresh handled by supabase-js.

---

## 5. Data Flow

### 5.1 Online Read
```
Component mounts
→ TanStack Query checks cache (stale-while-revalidate)
→ If stale: fetch from Supabase PostgREST
→ RLS validates member's JWT → returns filtered rows
→ TanStack Query updates cache + Dexie.js (IndexedDB)
→ Component renders
```

### 5.2 Online Write (Optimistic)
```
Member action (e.g. log workout set)
→ Zustand: update local state immediately (UI reflects change)
→ TanStack Query mutation → POST to Supabase
→ On success: invalidate query cache
→ On failure: rollback Zustand state + show error toast
```

### 5.3 Offline Read
```
Component mounts
→ TanStack Query: network request fails
→ Fall back to Dexie.js IndexedDB
→ Component renders cached data with "offline" indicator
```

### 5.4 Offline Write (Sync Queue)
```
Member action offline
→ Write to Dexie.js sync_queue table
→ Service Worker background sync registers
→ When online: process sync_queue FIFO
→ POST to Supabase
→ On success: remove from queue
→ On conflict: mark as conflict, prompt user
```

---

## 6. Caching Strategy

| Data Type | Cache Location | TTL | Offline Available |
|---|---|---|---|
| Membership card | Service Worker Cache + Dexie | Indefinite (until expiry) | ✅ |
| Member profile | Dexie + TanStack Query | 24 hours | ✅ |
| Workout plan | Dexie + TanStack Query | 1 hour | ✅ |
| Attendance history | Dexie + TanStack Query | 30 minutes | ✅ |
| Leaderboard | TanStack Query only | 5 minutes | ❌ |
| Notifications | Dexie | 7 days | ✅ |
| Gym announcements | Dexie | 1 hour | ✅ |
| Static assets | Service Worker CacheFirst | App version | ✅ |
| API responses | Service Worker NetworkFirst | 5 minutes | ✅ |

---

## 7. Realtime Subscriptions

Realtime is used sparingly to avoid battery drain on mobile.

| Channel | Event | Action |
|---|---|---|
| `notifications:{member_id}` | INSERT | Show in-app banner |
| `attendance:{gym_id}:{member_id}` | INSERT | Update attendance count |
| `announcements:{gym_id}` | INSERT | Show announcement badge |

All realtime channels require a valid JWT. Channels are joined on app foreground and paused/closed on background (Page Visibility API).

---

## 8. Push Notification Architecture

```
Admin Portal triggers event (e.g. payment due)
          │
          ▼
Supabase Edge Function (push-dispatcher)
          │
          ▼
Reads member's push subscription from push_subscriptions table
          │
          ▼
Web Push API (VAPID) → Browser Push Service (FCM/APNs/etc.)
          │
          ▼
Service Worker receives push event
          │
          ▼
Shows OS-level notification
          │
Member taps notification
          ▼
PWA opens to relevant screen (notification_click handler)
```

---

## 9. Multi-Tenancy

The PWA is gym-agnostic at the code level. A member's `gym_id` is embedded in their Supabase profile. All queries are automatically scoped by RLS:

```sql
-- Example RLS policy
CREATE POLICY "members_own_data" ON attendance
  FOR SELECT USING (
    member_id = auth.uid()
  );
```

Members from different gyms use the same PWA URL. Gym branding (logo, colours) is fetched from the `gyms` table and applied at runtime via CSS variables.

---

## 10. Security Architecture

| Concern | Approach |
|---|---|
| Authentication | Supabase Auth (JWT RS256) |
| Authorisation | PostgreSQL RLS on every table |
| Transport | HTTPS enforced (HSTS) |
| Token storage | supabase-js manages tokens (memory + localStorage fallback) |
| QR validation | QR contains signed payload — server validates signature on scan |
| Offline cache | No sensitive PII in Service Worker cache |
| XSS | Next.js output escaping + strict CSP headers |
| CSRF | Supabase uses JWT bearer tokens, not cookies (CSRF-immune) |

---

## 11. Environment Configuration

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BM...
VAPID_PRIVATE_KEY=...          # Server only (Edge Functions)
NEXT_PUBLIC_APP_URL=https://member.gymflow.in
```

---

## 12. Deployment

| Component | Platform | Notes |
|---|---|---|
| Member PWA | Vercel | Auto-deploy from `main` branch |
| Backend | Supabase Cloud | Shared with Admin Portal |
| Edge Functions | Supabase Edge | Push dispatcher, QR validator |
| Static Assets | Vercel Edge Network | Global CDN |
| PWA Manifest | Served from `/manifest.json` | Versioned with each deploy |
