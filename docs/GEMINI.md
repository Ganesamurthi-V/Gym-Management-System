# GymFlow - Project Instructions & Conventions

This document outlines the architectural patterns, coding standards, and development workflows for the GymFlow project. Adhere to these guidelines to ensure consistency and maintainability.

## 🚀 Overview
GymFlow is a full-stack gym management SaaS built for small to mid-size gyms in Tamil Nadu and Puducherry, India.

- **Frontend:** Next.js 15 (App Router)
- **Backend:** Supabase (PostgreSQL, Auth, RLS)
- **AI:** Google Gemini 2.0 Flash (Area Inference)
- **Styling:** Tailwind CSS
- **State Management:** React Server Components + Client-side hooks/state where necessary.

---

## 🏗️ Architectural Patterns

### 1. Multi-Gym Isolation (RLS)
- Every table (except shared ones like `geo_localities`) must have a `gym_id` column.
- Row Level Security (RLS) is used to ensure that a user can only access data belonging to their gym.
- **Implementation:** Policies in `supabase-schema.sql` use `EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())`.
- Always include `gym_id` in queries or rely on RLS policies to auto-filter.

### 2. Shared Logic (the `lib/` directory)
- **Geo Engine:** Found in `lib/geo/`. Centralizes area normalization logic.
- **Import Pipeline:** Found in `lib/import/`. Handles CSV/Excel parsing and normalization.
- **Supabase Clients:** Use `lib/supabase/client.ts` for client-side and `lib/supabase/server.ts` for server-side (RSC/API routes).

### 3. Component Organization
- **Layout:** Core shell components (sidebar, nav, guards) are in `components/layout/`.
- **UI:** Reusable UI components (loaders, etc.) are in `components/ui/`.
- **Feature-specific:** Large feature components can live within their respective `app/` directory folders (e.g., `app/onboarding/OnboardingWizard.tsx`).

---

## 🛠️ Coding Standards

### TypeScript
- Use strict typing. Avoid `any`.
- Define shared types in `types/index.ts`.
- Prefer interfaces for object structures.

### Next.js & React
- **Server Components:** Default to Server Components for data fetching.
- **Client Components:** Use `'use client'` directive only when necessary (interactivity, hooks, browser APIs).
- **Data Fetching:** Prefer fetching in Server Components and passing data to Client Components.

### Supabase
- Use the `ssr` package for authentication and session management.
- Always use the helper functions in `lib/supabase/` to instantiate clients.

### Observability
- Use `RequestLogger` from `lib/logger.ts` for structured APM-style tracing of API routes and Server Components.
- Use `logger.start()`, `logger.end()`, and `logger.step()` to trace execution times. Use `logger.error()` for exception handling.
- The logger automatically uses `console.error` to bypass Vercel logging filters ensuring consistent log delivery.

---

## 🔄 Workflows

### 1. Database Migrations
- The primary schema is maintained in `supabase-schema.sql`.
- New migrations should be added to `supabase/migrations/` and also reflected in `supabase-schema.sql`.

### 2. Geo Normalization
- When adding features involving location, use the Geo Intelligence Engine in `lib/geo/`.
- Priority: Gym-specific Alias > Static Alias > Exact Match > Trigram > Fuzzy > AI Fallback.

### 3. Bulk Import
- The import pipeline is a 5-stage process (Parse -> Area Normalization -> Area Review -> Edit -> Confirm).
- Ensure any changes to the import logic are reflected in `lib/import/pipeline.ts`.

---

## 📱 Mobile-First Design
- Use Tailwind CSS responsive utilities (`sm:`, `md:`, `lg:`, etc.).
- Pay special attention to table scrollability on mobile (use `overflow-y-auto` as noted in README).
- Dashboard and reports must be highly legible on small screens.

---

## 🤖 AI Integration
- `GEMINI_API_KEY` is a server-side secret for the App's Area Inference. NEVER prefix it with `NEXT_PUBLIC_`.
- Gemini 2.0 Flash is used for low-confidence area inference in `lib/geo/aiInference.ts`.
- **Graphify (Codebase Intelligence):** This project uses Groq (Llama 3.3 70B) for semantic extraction.
  - Command: `graphify extract . --backend openai --model "llama-3.3-70b-versatile" --api-base "https://api.groq.com/openai/v1"`
  - Note: Set `OPENAI_API_KEY` to your Groq API key when running extraction.

---

## 🧪 Testing (Coming Soon)
- (Reserved for future testing framework instructions)

## graphify

This project has a knowledge graph at graphify-out/ with code communities and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- For full semantic re-extraction: `graphify extract . --backend openai --model "llama-3.3-70b-versatile" --api-base "https://api.groq.com/openai/v1"`
