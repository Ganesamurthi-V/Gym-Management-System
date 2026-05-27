# GymDesk — Agent Context & Rules

This file is the **single source of truth** for all AI agents working on the GymDesk project. Read this completely before writing or modifying any code.

## 🚀 Project Overview

GymDesk is a multi-tenant SaaS application designed specifically for small to mid-sized gyms in **Tamil Nadu and Puducherry, India**. It manages members, attendance, billing, and bulk imports.

**Core Philosophy:** "Know exactly who paid, who didn't, and who's about to expire — without using notebooks."

- **Primary Users:** Gym owners with limited tech experience. The UI must be highly intuitive, mobile-first, and lightning-fast on 4G networks.
- **Tech Stack:** Next.js 15 (App Router), Supabase (PostgreSQL 15), Tailwind CSS, Framer Motion, Lenis Smooth Scroll.

---

## 🏛️ Architecture & Principles

### 1. Row Level Security (RLS) is Law
- **EVERY query** must be authenticated. The database uses strict RLS policies.
- Every table (except global geo tables) has a `gym_id` foreign key.
- Policies are defined using `owner_id` on the `gyms` table.
- **Never** try to bypass RLS or use the `service_role` key in the client application.

### 2. Multi-Tenant Data Isolation
- A gym owner can only see data belonging to their `gym_id`.
- The onboarding wizard handles creating the `gyms` row and default `gym_plan_prices`.

### 3. Client & Server Components
- **Default to Server Components (RSC):** Do data fetching on the server.
- **Client Components (`'use client'`):** Use only when interactivity (state, hooks, animations, event listeners) is required.
- **Supabase Clients:**
  - Server: `import { createClient } from '@/lib/supabase/server'`
  - Browser: `import { createClient } from '@/lib/supabase/client'`

### 4. UI/UX & Design System
- **Mobile-First Data Tables:** Use native `overflow-y-auto` for tables and lists to ensure smooth touch scrolling. **Do NOT apply Lenis smooth scrolling to internal scrollable containers.**
- **Color Palette:** The primary brand color is Royal Blue (`brand-500` / `#2563EB`). Success actions use `emerald`, warnings use `amber`, and destructive/overdue actions use `red`.
- **Loading States:** Use skeletons (`loading.tsx`) and the central `FitnessLoader.tsx` component.
- **Animations:** Use Framer Motion for scroll-reveal effects (like on the Reports page) and CSS for micro-interactions (`animate-pop-in`, `animate-pulse-soft`).
- **Typography:** The `Sora` font is the primary typeface (`--font-sora`).

---

## 🏗️ Core Modules & File Map

### 1. The Geo Intelligence Engine (`lib/geo/`)
GymDesk has a proprietary, 11-step area normalization engine to handle the messy reality of Indian locality spellings.
- **`matchArea.ts`:** The entry point. `matchArea()` and `matchAreaBatch()`.
- **`fuzzyMatch.ts`:** Implements Levenshtein, Dice Coefficient, and LCS.
- **`normalizer.ts`:** Text cleanup, abbreviation expansion, phonetic hashing.
- **`aliases.ts`:** 1200+ static aliases mapping messy strings to canonical localities.
- **`aiInference.ts`:** Fallback to Google Gemini 2.0 Flash for unresolved areas.

### 2. Bulk Import Pipeline (`lib/import/`)
Handles raw Excel/CSV data with 5 smart stages.
- **`pipeline.ts`:** The core 6-stage import logic (Parse → Area Normalize → Area Review → Edit → Confirm).
- **`normalizers.ts`:** Smart column detection and value normalization (e.g., parsing "monthly", "1m", "30 days" into `'monthly'`).
- **ID Assignment:** Automatically generates `GF`-prefixed IDs (`GF0001`) while preserving external IDs in `legacy_member_id`.

### 3. Onboarding Wizard (`app/onboarding/`)
A 6-step setup flow for new gym owners covering:
1. Gym Details (Name, Type, City, Phone)
2. Membership Plans (Prices, Joining Fees)
3. Business Metrics
4. Operations (Timings, Shifts)
5. Marketing (Lead sources, Reminders)
6. AI Personalization

### 4. Dashboard & Reports (`app/dashboard/`, `app/reports/`)
- **Dashboard:** Live stats, quick actions, and the "Getting Started" checklist.
- **Reports:** Charts built with Recharts, featuring scroll-reveal animations.

---

## 🔒 Security & Environment Variables

- **`NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`:** Required for the Supabase client.
- **`GEMINI_API_KEY`:** Server-side ONLY. Never expose to the client. Required for AI area inference.
- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`:** Used for city autocomplete in the onboarding wizard.

---

## 📝 Coding Guidelines for AI Agents

1. **Check Existing Logic:** Before writing a new utility (like date formatting or currency formatting), check `lib/utils.ts`.
2. **Component Granularity:** Keep components small. If a file exceeds 300 lines (with the exception of large forms like `OnboardingWizard.tsx`), consider refactoring.
3. **TypeScript:** Strict typing is enforced. Use the interfaces defined in `types/index.ts`. Avoid `any`.
4. **Tailwind Best Practices:** Use utility classes. Do not write custom CSS unless absolutely necessary (like complex keyframes). Use `cn()` from `lib/utils.ts` for conditional class joining.
5. **Database Changes:** If you need to modify the schema, write the migration SQL and append it to `supabase-schema.sql`. Make sure RLS policies are included for any new tables.

---

## 🔄 Current Project Status (As of May 2026)

- **Completed:** Auth, Onboarding, Dashboard, Member CRUD, Bulk Import Pipeline, Geo Intelligence Engine, Attendance, Reports, Account Settings.
- **Recent Updates:** Integrated Lenis smooth scroll globally, refined the 6-step onboarding wizard, added Google Places metadata to members, implemented PDF daily collection reports.
- **Stable:** The core architecture is stable and production-ready.

## 📌 Agent Directives
- **DO NOT** rewrite the Geo Engine or Import Pipeline unless specifically instructed; they are highly optimized.
- **DO NOT** remove existing comments or documentation.
- **DO** proactively suggest UI polish (micro-animations, better loading states) that aligns with the "premium HackerRank" aesthetic.
