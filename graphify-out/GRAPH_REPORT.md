# Graph Report - gymflow  (2026-06-26)

## Corpus Check
- 220 files · ~112,536 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 984 nodes · 1605 edges · 90 communities (78 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e9aa07a5`
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
- [[_COMMUNITY_Community 31|Community 31]]
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
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 52 edges
2. `checkRateLimit()` - 28 edges
3. `mapSupabaseError()` - 23 edges
4. `createClient()` - 21 edges
5. `compilerOptions` - 17 edges
6. `GymFlow — Gym Management SaaS` - 17 edges
7. `GymDesk — Gym Management SaaS` - 17 edges
8. `compilerOptions` - 16 edges
9. `verifyRequestAuth()` - 16 edges
10. `RequestLogger` - 16 edges

## Surprising Connections (you probably didn't know these)
- `GymDetailPage()` --calls--> `NotFound()`  [INFERRED]
  gymflow-admin/app/gyms/[gymId]/page.tsx → app/not-found.tsx
- `getReportsData()` --calls--> `createClient()`  [EXTRACTED]
  app/_reports_archived/page.tsx → lib/supabase/server.ts
- `getReportsData()` --calls--> `createClient()`  [EXTRACTED]
  app/reports/page.tsx → lib/supabase/server.ts
- `AccountClient()` --calls--> `formatDate()`  [EXTRACTED]
  app/account/AccountClient.tsx → lib/utils.ts
- `POST()` --calls--> `checkRateLimit()`  [EXTRACTED]
  app/api/geo/batch-normalize/route.ts → lib/rateLimit.ts

## Communities (90 total, 12 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (37): mapSupabaseError(), POST(), POST(), MembershipPlan, POST(), mapSupabaseError(), POST(), deletions (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (39): applyWeightedScore(), buildUnresolved(), mapSupabaseError(), POST(), AI_CACHE, callGroq(), groqInferBatch(), groqInferLocation() (+31 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (41): AreaMeta, EditedRow, EditMembersClient(), MemberRow, Props, Step, DoneResult, EDIT_FIELDS (+33 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (48): dependencies, clsx, date-fns, exceljs, framer-motion, @googlemaps/js-api-loader, html5-qrcode, jspdf (+40 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (16): AIPersonalizationData, BusinessMetricsData, DEFAULT_DATA, DEFAULT_PLANS, GymDetailsData, LEAD_SOURCES, MarketingData, MembershipPlan (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (9): metadata, sora, metadata, viewport, MobileNav(), NAV_ITEMS, NavItem, SHELL_EXCLUDED (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (13): EditMemberClient(), Props, Step, Props, Attendance, formatMemberId(), Gym, Member (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (19): INDIA_CITIES, loc(), norm(), phonetic(), PONDICHERRY_LOCALITIES, PUDUCHERRY_CITIES, SEED_LOCALITIES, SEED_LOCALITIES_DEDUPED (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (20): 1. Database Migrations, 1. Multi-Gym Isolation (RLS), 2. Geo Normalization, 2. Shared Logic (the `lib/` directory), 3. Bulk Import, 3. Component Organization, 🤖 AI Integration, 🏗️ Architectural Patterns (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (13): AddressComponent, extractCity(), extractCountry(), extractGoogleAddress(), extractLocality(), extractPostalCode(), extractState(), getComponent() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.20
Nodes (7): ModeFilter, Payment, PaymentsClient(), PendingMember, Period, ProductSale, Props

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (17): 1. Row Level Security (RLS) is Law, 1. The Geo Intelligence Engine (`lib/geo/`), 2. Bulk Import Pipeline (`lib/import/`), 2. Multi-Tenant Data Isolation, 3. Client & Server Components, 3. Onboarding Wizard (`app/onboarding/`), 4. Dashboard & Reports (`app/dashboard/`, `app/reports/`), 4. UI/UX & Design System (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (50): API Routes, Authentication & Routing, Bulk Import Pipeline, code:block1 (gymflow/), code:bash (# Required), code:sql (UPDATE gyms SET onboarding_completed = TRUE), code:bash (cd gymflow), code:block5 (POST /api/geo/seed) (+42 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (7): Props, DAYS, EXERCISE_LIBRARY, ExerciseInstance, Props, ProgramSetupData, Props

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (10): 🔷 Agent 8 — FEATURE EXPANSION STRATEGIST, Exploratory, Feature Backlog You Maintain, High Priority, How You Communicate, Identity, Medium Priority, Recently Shipped ✅ (+2 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (25): dependencies, jose, lucide-react, next, react, react-dom, react-hot-toast, @supabase/supabase-js (+17 more)

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (3): AccountClient(), ModalType, Props

### Community 21 - "Community 21"
Cohesion: 0.33
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
Cohesion: 0.18
Nodes (13): resolveErrorAction(), ErrorsPage(), DashboardPage(), getSentryEvents(), getSentryIssue(), getSentryIssues(), getSentryStats(), projectBase() (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 34 - "Community 34"
Cohesion: 0.38
Nodes (8): DashboardPage(), DashboardPage(), getDashboardData(), MemberDetailPage(), getDaysRemaining(), getMemberStatus(), getMembersData(), MembersPage()

### Community 36 - "Community 36"
Cohesion: 0.40
Nodes (4): [2023-10-27] Reports Page Redesign & PDF Hardening, Learning, Security Fix, Sentinel Journal 🛡️

### Community 41 - "Community 41"
Cohesion: 0.50
Nodes (3): content, files, fs

### Community 49 - "Community 49"
Cohesion: 0.50
Nodes (3): nextConfig, securityHeaders, { withSentryConfig }

### Community 60 - "Community 60"
Cohesion: 0.10
Nodes (16): getCachedInventory(), getCachedInventoryItem(), getCachedInventorySales(), getCachedInventorySiblings(), InventoryItemPage(), invalidateInventoryCache(), invalidateInventoryItemCache(), BarcodeScannerModalProps (+8 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (10): DashboardClient(), Props, StatCardCurrency(), CONFETTI_COLORS, GettingStartedChecklist(), Particle, Task, TASKS (+2 more)

### Community 64 - "Community 64"
Cohesion: 0.05
Nodes (30): fetchAttendanceLogsAction(), AttendanceLog, AttendanceLogClient(), Props, AttendanceLogPage(), getAttendanceLogs(), cacheWrapper(), deleteCache() (+22 more)

### Community 66 - "Community 66"
Cohesion: 0.15
Nodes (8): AttendanceClient(), AttendanceMember, MessageState, Props, DueMember, DuesClient(), Props, createClient()

### Community 67 - "Community 67"
Cohesion: 0.21
Nodes (14): ExpiringMemberRow(), MemberDetailClient(), buildCustomWhatsAppLink(), buildWhatsAppLink(), calcEndDate(), formatDate(), getPlanDuration(), isValidPhone() (+6 more)

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (16): cn(), exportMembersToExcelAction(), loadMoreMembersAction(), FilterType, MembersClient(), MembersContent(), Props, ExpiringMember (+8 more)

### Community 72 - "Community 72"
Cohesion: 0.32
Nodes (6): DailyReportData, escapeHtml(), generateDailyCollectionPDF(), generateDailyReportPDF(), NewMemberRow, PaymentRow

### Community 74 - "Community 74"
Cohesion: 0.07
Nodes (26): NotFound(), POST(), EditMemberPage(), POST(), metadata, RootLayout(), redis, config (+18 more)

## Knowledge Gaps
- **359 isolated node(s):** `PROTECTED_PREFIXES`, `config`, `securityHeaders`, `nextConfig`, `{ withSentryConfig }` (+354 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `Community 0` to `Community 64`, `Community 1`, `Community 66`, `Community 34`, `Community 2`, `Community 69`, `Community 6`, `Community 4`, `Community 11`, `Community 20`, `Community 60`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `invalidatePattern()` connect `Community 64` to `Community 74`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Community 66` to `Community 64`, `Community 2`, `Community 67`, `Community 4`, `Community 69`, `Community 6`, `Community 5`, `Community 11`, `Community 20`, `Community 60`, `Community 62`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `PROTECTED_PREFIXES`, `config`, `securityHeaders` to the rest of the system?**
  _359 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0656010656010656 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09959183673469388 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05323653962492438 - nodes in this community are weakly interconnected._