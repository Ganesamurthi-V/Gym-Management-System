# Graph Report - gymflow  (2026-05-27)

## Corpus Check
- 102 files · ~79,871 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 609 nodes · 988 edges · 60 communities (56 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a187d578`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 59|Community 59]]

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 31 edges
2. `checkRateLimit()` - 23 edges
3. `GymDesk — Gym Management SaaS` - 17 edges
4. `compilerOptions` - 16 edges
5. `createClient()` - 16 edges
6. `ROUTE_LIMITS` - 14 edges
7. `normalizeInput()` - 14 edges
8. `POST()` - 13 edges
9. `GymDesk — AI Agent Roster` - 13 edges
10. `formatDate()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Props` --references--> `MemberWithStatus`  [EXTRACTED]
  app/members/MembersClient.tsx → types/index.ts
- `AccountClient()` --calls--> `formatDate()`  [EXTRACTED]
  app/account/AccountClient.tsx → lib/utils.ts
- `POST()` --calls--> `checkRateLimit()`  [EXTRACTED]
  app/api/geo/batch-normalize/route.ts → lib/rateLimit.ts
- `POST()` --calls--> `detectDatasetCluster()`  [EXTRACTED]
  app/api/geo/batch-normalize/route.ts → lib/geo/clustering.ts
- `POST()` --calls--> `checkRateLimit()`  [EXTRACTED]
  app/api/geo/normalize/route.ts → lib/rateLimit.ts

## Communities (60 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (33): mapSupabaseError(), POST(), POST(), MembershipPlan, POST(), mapSupabaseError(), POST(), DashboardPage() (+25 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (40): applyWeightedScore(), buildUnresolved(), mapSupabaseError(), POST(), AI_CACHE, callGroq(), groqInferBatch(), groqInferLocation() (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (35): DoneResult, EDIT_FIELDS, ImportEditPage(), Step, matchAreaBatch(), searchLocalities(), useLenisScroll(), cellStr() (+27 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (38): dependencies, clsx, date-fns, exceljs, framer-motion, @googlemaps/js-api-loader, jspdf, jspdf-autotable (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (14): AIPersonalizationData, BusinessMetricsData, DEFAULT_DATA, DEFAULT_PLANS, GymDetailsData, LEAD_SOURCES, MarketingData, MembershipPlan (+6 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (7): metadata, sora, viewport, MobileNav(), NAV_ITEMS, SHELL_EXCLUDED, SmoothScrollProvider()

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (19): ExpiringMemberRow(), MemberDetailClient(), Props, buildCustomWhatsAppLink(), buildWhatsAppLink(), calcEndDate(), formatDate(), getPlanDuration() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (18): INDIA_CITIES, loc(), norm(), phonetic(), PONDICHERRY_LOCALITIES, PUDUCHERRY_CITIES, SEED_LOCALITIES, SeedLocality (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (18): 1. Database Migrations, 1. Multi-Gym Isolation (RLS), 2. Geo Normalization, 2. Shared Logic (the `lib/` directory), 3. Bulk Import, 3. Component Organization, 🤖 AI Integration, 🏗️ Architectural Patterns (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (13): AddressComponent, extractCity(), extractCountry(), extractGoogleAddress(), extractLocality(), extractPostalCode(), extractState(), getComponent() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (12): DashboardClient(), StatCardCurrency(), DueMember, DuesClient(), Props, formatCurrency(), ModeFilter, Payment (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (9): Props, CONFETTI_COLORS, GettingStartedChecklist(), Particle, Task, TASKS, DashboardStats, Gym (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (13): API Routes, code:block1 (gymflow/), code:bash (# Required), code:bash (# Option A: CLI), Core Modules, Deployment to Vercel, Environment Variables, Features (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (8): AttendanceClient(), AttendanceMember, Props, cn(), FilterType, MembersClient(), Props, createClient()

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (10): 🔷 Agent 8 — FEATURE EXPANSION STRATEGIST, Exploratory, Feature Backlog You Maintain, High Priority, How You Communicate, Identity, Medium Priority, Recently Shipped ✅ (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (3): AccountClient(), ModalType, Props

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (6): AreaMeta, EditedRow, EditMembersClient(), MemberRow, Props, Step

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (9): code:sql (UPDATE gyms SET onboarding_completed = TRUE), code:bash (cd gymflow), code:block5 (POST /api/geo/seed), Setup Instructions, Step 1: Create Supabase Project, Step 2: Run Database Schema, Step 3: Create a Gym Owner User, Step 4: Local Development (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.31
Nodes (6): EditMemberClient(), Props, Step, formatMemberId(), Member, parseMemberId()

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (6): ExpiringMember, MemberDue, MonthData, Props, ReportsClient(), TabType

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (6): GymDesk — AI Agent Roster, Multi-Agent Collaboration, Project Context (Shared by All Agents), Quick Reference, Single Agent Prompt, Usage Guide

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (6): ⚪ Agent 10 — CODE REVIEW & REFACTORING ADVISOR, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (6): 🔵 Agent 1 — BACKEND ARCHITECT, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (6): 🟢 Agent 2 — FRONTEND & UI/UX ENGINEER, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (6): 🔴 Agent 3 — SECURITY ENGINEER, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (6): 🟡 Agent 4 — GEO INTELLIGENCE SPECIALIST, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (6): 🟣 Agent 5 — PERFORMANCE ENGINEER, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (6): 🟤 Agent 6 — DATA & ANALYTICS ENGINEER, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (6): 🔶 Agent 7 — TESTING & QA ENGINEER, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (6): 🟠 Agent 9 — DEVOPS & INFRASTRUCTURE ENGINEER, How You Communicate, Identity, Improvement Areas You Own, Your Constraints & Rules, Your Expertise

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (5): Core Tables, Database Schema, Geo Tables, Key Constraints, Migrations (all in `supabase-schema.sql`)

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (5): Color Palette (Tailwind tokens), Component Classes (defined in `globals.css`), Custom Animations, Design System, Typography

### Community 34 - "Community 34"
Cohesion: 0.40
Nodes (5): Confidence Thresholds, Geo Intelligence Engine, Normalization Pipeline (11 steps, priority order), Phonetic Key Rules, `searchLocalities()`

### Community 35 - "Community 35"
Cohesion: 0.40
Nodes (5): Key Patterns & Conventions, Naming Conventions, Performance Optimizations (`next.config.js`), TypeScript Types (`types/index.ts`), Utility Functions (`lib/utils.ts`)

### Community 36 - "Community 36"
Cohesion: 0.40
Nodes (4): [2023-10-27] Reports Page Redesign & PDF Hardening, Learning, Security Fix, Sentinel Journal 🛡️

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (4): DailyReportData, escapeHtml(), generateDailyCollectionPDF(), PaymentRow

### Community 39 - "Community 39"
Cohesion: 0.50
Nodes (4): Authentication & Routing, Layout Guards, Login Page, Middleware (`middleware.ts`)

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (3): Bulk Import Pipeline, Pipeline Stages (in `lib/import/pipeline.ts`), Supported Import Fields

## Knowledge Gaps
- **251 isolated node(s):** `PROTECTED_PREFIXES`, `config`, `nextConfig`, `name`, `version` (+246 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `Community 0` to `Community 1`, `Community 4`, `Community 11`, `Community 16`, `Community 17`, `Community 19`, `Community 20`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Community 14` to `Community 2`, `Community 6`, `Community 11`, `Community 12`, `Community 16`, `Community 17`, `Community 19`, `Community 31`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `searchLocalities()` connect `Community 2` to `Community 8`, `Community 17`, `Community 1`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `PROTECTED_PREFIXES`, `config`, `nextConfig` to the rest of the system?**
  _251 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07168458781362007 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09351432880844646 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06547619047619048 - nodes in this community are weakly interconnected._