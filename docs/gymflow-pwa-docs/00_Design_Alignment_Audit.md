# GymFlow Member PWA — Design Alignment Audit

**Date:** 28 July 2026
**Scope:** Compare `docs/gymflow-pwa-docs/` against the main GymFlow web app; realign the UI/UX spec.
**Verdict:** The PWA docs did **not** match the main web app. They matched the **super-admin** design system instead. Nine files reviewed, seven edited.

---

## 1. What the codebase actually contains

`Gym-Management-System-main/` holds four separate front-ends, not one:

| Path | What it is | Theme | Brand | Font |
|---|---|---|---|---|
| `app/` | **Main web app** — gym owner / staff dashboard | Light (`bg-white`, `text-slate-900`) | Blue `#2563EB` | **Sora** |
| `gymflow-admin/` | GymFlow super-admin web panel | Dark (`#0a0f1e`) | Indigo `#6366f1` | — |
| `gymflow-mobile/` | GymFlow super-admin React Native app | Dark (`#0a0f1e`) | Indigo `#818cf8` | System |
| `landing-page/` | Marketing site | — | — | — |

Sources of truth for the main app:
- `tailwind.config.js` — `colors.brand` (50–900, `500 = #2563EB`), `colors.cyan`, `colors.surface`, `screens.xs = 360px`, `screens.3xl = 1920px`, `fontFamily.sans = var(--font-sora)`
- `app/globals.css` — `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input-field`, `.card`, `.status-active/expiring/expired`, `.skeleton`, `.glass`, `.tap-target`, `.no-scrollbar`, `.pb-safe-bottom`, plus 8 keyframes
- `app/layout.tsx` — Sora via `next/font/google`, `themeColor: '#2563EB'`, `NextTopLoader` in `#2563EB`, `react-hot-toast` top-right

---

## 2. The core finding

`04_UI_UX_Guidelines.md` v2.1 specified an **OLED dark, indigo, Inter** design system. Every one of those three choices matches `gymflow-admin` / `gymflow-mobile` — the internal super-admin tools — and none of them matches the main web app the member PWA is supposed to sit beside.

This is not a cosmetic drift. Building to v2.1 would have produced a member app that looked like a different company's product from the gym owner's dashboard, and would have required a full contrast re-audit later regardless.

---

## 3. Mismatches found

### Blocking (would ship a visibly different product)

| # | Area | Doc said (v2.1) | Web app does | Fixed in |
|---|---|---|---|---|
| 1 | Theme | Dark-only, `#0F0F13`, "avoid harsh whites" | Light, `#FFFFFF`, `text-slate-900` | 04 §0, §1, §2.2, §2.7 |
| 2 | Brand | Indigo `#6366F1` | Blue `#2563EB` (`brand-500`) | 04 §2.1; 03; 07; 08 |
| 3 | Brand secondary | Violet `#8B5CF6` | Cyan `#06B6D4` | 04 §2.1 |
| 4 | Font | Inter / SF Pro | **Sora** via `next/font` | 04 §3; 08 §9.5 |
| 5 | Surfaces | 4 progressively lighter navies | White at every level; shadow-differentiated | 04 §2.2, §6 |
| 6 | Text ramp | `#F8F8FF` → `#3D3D62` | Slate `#0F172A` → `#CBD5E1` | 04 §2.4 |
| 7 | Borders | `#2E2E4A` / `#3D3D62` | Slate `#E2E8F0` / `#CBD5E1` | 04 §2.5, §7 |
| 8 | manifest | `theme_color #6366F1`, `background_color #0F0F13` | `#2563EB` / white | 08 §2 |
| 9 | DB default | `gyms.brand_color DEFAULT '#6366F1'` | should be `#2563EB` | 03; 07 |

### Significant (correctness or consistency)

| # | Area | Doc said | Web app does | Fixed in |
|---|---|---|---|---|
| 10 | Card radius | `--radius-xl` = 16px | `.card` is `rounded-xl` = **12px** | 04 §5.0, §5.1 |
| 11 | Tap scale | `scale(0.95)` / `(0.97)` | `active:scale-[0.98]` | 04 §5.2, §9.3 |
| 12 | Disabled buttons | Grey bg + grey text tokens | `disabled:opacity-50` | 04 §5.2 |
| 13 | Glass | Dark translucent | `bg-white/80 backdrop-blur-md` | 04 §10 |
| 14 | Overlay | `rgba(0,0,0,0.60)` | `bg-slate-900/40 backdrop-blur-sm` | 04 §2.2, §8.3 |
| 15 | Shimmer | 1600ms | 1.4s | 04 §5.10, §9.3 |
| 16 | Status naming | `warning` for 7–14 days | `.status-expiring` | 04 §2.5, §17; 05 |
| 17 | Breakpoints | Generic `--screen-*` | Adds `xs: 360px`, `3xl: 1920px` | 04 §4 |
| 18 | Focus ring | `#818CF8` | `focus:ring-brand-400` `#60A5FA` | 04 §15 |
| 19 | Chart series | `-400` pastels (dark-tuned) | Need `-600` on white | 04 §11 |
| 20 | Gamification | Neon glow shadows | Needs tinted fill + border triads | 04 §2.6; 06 §7.2 |
| 21 | Component library | "Tailwind + shadcn/ui" | Web app uses **no shadcn** | 02 §2 |
| 22 | Keyframes | Bespoke set | 8 already exist in `globals.css` | 04 §9.1 |
| 23 | Contrast table | Computed against `#0F0F13` | All figures invalid on white | 04 §15; 10 |

### Divergences kept deliberately

| Item | Web app | PWA | Why |
|---|---|---|---|
| Input font size | 14px (`text-sm`) | **16px** | Sub-16px inputs trigger iOS Safari auto-zoom on focus |
| Toast position | top-right | **top-center** | Top-right clips on a 375px notched viewport |
| Primary mobile nav | Slide-up drawer (8 destinations) | Persistent bottom nav (5 tabs) | Different information architecture; drawer styling still reused for sheets |
| Z-index | Raw `z-[9998]` / `z-[9999]` | Token scale 100–700 | The web app's raw values are a known wart, not a pattern to copy |
| QR code | — | Dark modules on white | v2.1 specified white-on-dark; cheap gym scanners expect dark-on-light |

---

## 4. What I preserved rather than flattened

The web app is **not** uniformly light. Its auth screens (`app/auth/login`, `create-account`, `setup-password`) use a dark slate-950 background with three animated gradient orbs, a 60px SVG grid at 4% opacity, and a `brand-300 → cyan-400` clipped-text wordmark.

So "match the web app" does not mean "delete all dark". v3.0 keeps a dark treatment in exactly three places, each inherited rather than invented:

1. **Auth and onboarding** — mirrors the web app's login screen (04 §12.6)
2. **Badge-earn celebration overlay** — the one moment where gamification neon still works (04 §9.4)
3. **Digital membership card** — brand gradient, not dark, but deliberately vivid against the white page (04 §12.2)

This is the only judgment call I made that goes beyond mechanical token substitution. If you'd rather the PWA be light with no exceptions, §12.6 and §9.4 are the two sections to cut.

---

## 5. Files changed

| File | Change |
|---|---|
| **`04_UI_UX_Guidelines.md`** | **Rewritten, v2.1 → v3.0.** New §0 (relationship to the web app, dark-surface exceptions), §5.0 (radius scale), §9.1 (reuse the web app's keyframes). §2 colour, §3 typography, §6 elevation, §7 borders, §10 glass, §11 charts, §15 accessibility all recomputed for light. §18 rewritten as a full migration table with reasons |
| `02_System_Architecture.md` | Added a design-lineage note; corrected the styling row (shadcn is not used by the web app) |
| `03_Database_Schema.md` | `gyms.brand_color` default `#6366F1` → `#2563EB` |
| `05_Feature_Specifications.md` | Membership urgency colours → `active`/`expiring`/`expired` triads; `--color-error` → `--color-text-error` |
| `06_Gamification_Engine.md` | Badge grid: glow → tinted fill + border; locked state tokenised |
| `07_API_Specification.md` | Example `brand_color` → `#2563EB` |
| `08_PWA_Technical_Spec.md` | manifest `theme_color`/`background_color`; added `color-scheme: light` and the auth-route override note; font loading Inter → Sora via `next/font` |
| `09_Development_Roadmap.md` | Added a "port web app theme" M0 task (2h); component-library guidance now points at the web app, not `gymflow-admin`; "dark/light toggle" backlog item reworded |
| `10_Testing_Checklist.md` | Contrast rows recomputed for white; added rows for white-on-brand, status triads, muted-text misuse, focus-ring verification, custom brand-colour guard, side-by-side theme check, and the dark auth shell |

---

## 6. Two things to verify before building

1. **Focus ring contrast.** `--color-brand-400` (`#60A5FA`) on white is roughly 2.5:1, below the 3:1 threshold for UI components. The 2px ring plus the offset white halo is *intended* to satisfy WCAG 2.4.11 focus appearance, but I could not verify that against a rendered build. If it fails, step the ring to `brand-500` (`#2563EB`, ~5.2:1) — and make the same change upstream in the web app, which has the identical issue.

2. **Custom gym brand colours.** On the old dark background, almost any `brand_color` a gym uploaded stayed legible. On white it will not. §2.3 now requires darkening a supplied colour until it clears 4.5:1 before it is assigned to `--color-brand`. There is currently no such guard anywhere in the codebase, and gyms with light brand colours (yellow, light green, pale cyan) will otherwise produce unreadable buttons.

Separately: any screen mockups already produced against v2.x need contrast rework, not just a background swap.
