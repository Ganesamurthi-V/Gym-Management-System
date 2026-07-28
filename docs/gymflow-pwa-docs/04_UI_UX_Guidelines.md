# GymFlow Member PWA — UI/UX Guidelines

**Version:** 3.0
**Design tokens file:** `design-tokens.css`
**Parent design system:** GymFlow Web App (`tailwind.config.js` + `app/globals.css`)

> This document is the single source of truth for visual design decisions in the GymFlow Member PWA.
>
> **v3.0 is a realignment release.** v2.x described a dark-mode, indigo, Inter-based product. That palette belongs to the GymFlow **super-admin** surfaces (`gymflow-admin`, `gymflow-mobile`), not to the member-facing product. The Member PWA is a sibling of the **main GymFlow web app** and must look and feel like it: light surfaces, brand blue, Sora, `rounded-xl`. All tokens below are derived directly from the web app's `tailwind.config.js` and `app/globals.css`. See Section 18 for the full v2.1 → v3.0 migration table.

---

## 0. Relationship to the Main Web App

GymFlow ships three visually distinct product surfaces. Getting this mapping right is the whole point of v3.0.

| Surface | Audience | Theme | Brand | Font |
|---|---|---|---|---|
| **Main web app** (`app/`) | Gym owners / staff | **Light** | Blue `#2563EB` | **Sora** |
| **Member PWA** (this doc) | Gym members | **Light** ← *matches web app* | Blue `#2563EB` | **Sora** |
| Super-admin (`gymflow-admin`, `gymflow-mobile`) | GymFlow internal | Dark | Indigo `#6366f1` | System |

**Rules of engagement:**

1. The Member PWA **inherits** the web app's token values. If `tailwind.config.js` changes in the main app, `design-tokens.css` must be updated to match. The web app is upstream.
2. The PWA adds tokens the web app doesn't need (gamification, elevation, glass, motion presets). It never *contradicts* an existing web app value.
3. Member-facing and owner-facing screens will sit side by side in screenshots, demos, and on the same phone. They must read as one product.

### 0.1 Where dark surfaces are still allowed

The web app is not uniformly light — it uses a dark, gradient-orb treatment for **auth and pre-login screens** (`app/auth/login`, `create-account`, `setup-password`). The PWA mirrors that split exactly:

| Screen group | Theme |
|---|---|
| Login, OTP, account setup, PWA welcome/splash | **Dark** (`--color-auth-bg`, orb + grid background) |
| Every authenticated app screen | **Light** |
| Digital membership card (the "showpiece") | **Brand gradient** over light page — see 12.2 |

This is the one deliberate deviation from "light everywhere", and it is inherited from the web app rather than invented here.

---

## 1. Design Philosophy

The GymFlow Member PWA should feel like a premium native fitness app — fast, tactile, and motivating — while being unmistakably the same product as the gym owner's dashboard.

**Core principles:**
- **Mobile-first, always** — design for 375px wide; the web app's `xs: 360px` breakpoint is the true lower bound
- **Light-first, matching the web app** — white page background, slate text, blue brand. Dark is reserved for auth (see 0.1)
- **Motion communicates state** — use `--transition-*` and `--duration-*` tokens purposefully, never decoratively
- **Gamification is visual but restrained** — on light surfaces, XP/streaks/badges use *tinted fills and coloured borders* rather than the neon glows used on dark. See Section 2.6
- **Offline is a first-class experience** — degraded state still feels premium via the shared `.skeleton` shimmer
- **Gym branding is respected** — `--color-brand` and `--color-brand-2` are dynamically overridden at runtime
- **Elevation tells the story** — on light surfaces, elevation is expressed through **shadow + border**, not background darkening

---

## 2. Colour System

### 2.1 Brand Palette

Taken verbatim from the web app's `tailwind.config.js` `colors.brand` scale. Never write raw hex in components.

```css
/* Brand — blue, matches main web app. Dynamically overridden at runtime. */
--color-brand-50:   #EFF6FF;
--color-brand-100:  #DBEAFE;
--color-brand-200:  #BFDBFE;
--color-brand-300:  #93C5FD;
--color-brand-400:  #60A5FA;
--color-brand-500:  #2563EB;   /* ← primary */
--color-brand-600:  #1D4ED8;
--color-brand-700:  #1E40AF;
--color-brand-800:  #1E3A8A;
--color-brand-900:  #172554;

/* Semantic aliases */
--color-brand:        var(--color-brand-500);   /* #2563EB */
--color-brand-light:  var(--color-brand-400);   /* #60A5FA */
--color-brand-dark:   var(--color-brand-600);   /* #1D4ED8 */

/* Secondary — cyan, the web app's companion accent */
--color-brand-2:       #06B6D4;   /* cyan-500 */
--color-brand-2-light: #22D3EE;   /* cyan-400 */
--color-brand-2-dark:  #0891B2;   /* cyan-600 */

/* Brand-tinted surfaces */
--color-brand-subtle:   #EFF6FF;                    /* brand-50  — selected rows, active nav */
--color-brand-muted:    #DBEAFE;                    /* brand-100 — hover on brand surfaces */
--color-brand-emphasis: rgba(37, 99, 235, 0.20);    /* focus glows, accent overlays */
```

> The web app's signature primary action is a **horizontal gradient `brand-500 → brand-600`** (`bg-gradient-to-r from-brand-500 to-brand-600`), not a flat fill. The PWA uses the same. See `--gradient-button`.

### 2.2 Surface Hierarchy

Light surfaces, matching `colors.surface` in the web app's Tailwind config. On light backgrounds, **elevation is shadow-driven** — do not stack progressively darker greys.

| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#FFFFFF` | Page background (Elevation 0) |
| `--color-bg-secondary` | `#F8FAFC` | Alternate page bg for dense list screens (slate-50) |
| `--color-surface` | `#FFFFFF` | Base cards (Elevation 1) — border + `--shadow-sm` do the work |
| `--color-surface-2` | `#FFFFFF` | Elevated cards, dropdowns (Elevation 2) — `--shadow-md` |
| `--color-surface-3` | `#FFFFFF` | Modals, bottom sheets (Elevation 3) — `--shadow-lg` |
| `--color-surface-4` | `#FFFFFF` | Tooltips, dialogs (Elevation 4) — `--shadow-float` |
| `--color-surface-sunken` | `#F1F5F9` | Inset wells, progress tracks, code blocks (slate-100) |
| `--color-surface-hover` | `#F8FAFC` | Hover over base surface (slate-50) |
| `--color-surface-pressed` | `#F1F5F9` | Active/pressed state (slate-100) |
| `--color-surface-selected` | `#EFF6FF` | Selected row or active nav item (brand-50) |

Auth-only dark surfaces (see 0.1):
```css
--color-auth-bg:      #020617;   /* slate-950 */
--color-auth-surface: #0F172A;   /* slate-900 */
--color-auth-border:  rgba(255, 255, 255, 0.08);
--color-auth-text:    #F8FAFC;
```

Overlay / scrim — matches the web app's mobile nav backdrop (`bg-slate-900/40 backdrop-blur-sm`):
```css
--color-overlay:       rgba(15, 23, 42, 0.40);   /* Modals, sheets, drawers */
--color-overlay-light: rgba(15, 23, 42, 0.20);   /* Lighter overlays */
--color-overlay-blur:  blur(4px);                /* Pair with the scrim */
```

### 2.3 Gym Branding Override

On app load, fetch `gyms.brand_color` and apply. Only override the brand tokens — never neutrals or semantic tokens.

```javascript
function applyGymBranding(gym) {
  const root = document.documentElement;
  const base = gym.brand_color ?? '#2563EB';   // ← web app default

  root.style.setProperty('--color-brand-500', base);
  root.style.setProperty('--color-brand',     base);
  root.style.setProperty('--color-brand-2',   gym.brand_color_2 ?? '#06B6D4');

  // Derive the scale programmatically (tinycolor2)
  root.style.setProperty('--color-brand-400',    lighten(base, 12));
  root.style.setProperty('--color-brand-600',    darken(base, 8));
  root.style.setProperty('--color-brand-700',    darken(base, 16));
  root.style.setProperty('--color-brand-subtle', tint(base, 94));   // ~brand-50
  root.style.setProperty('--color-brand-muted',  tint(base, 86));   // ~brand-100
}
```

> **Light-mode contrast guard.** A custom `brand_color` sits on white and must clear 4.5:1 for text and 3:1 for UI. If the supplied colour fails, darken it until it passes before assigning `--color-brand`, and keep the original only for large decorative fills. This check did not exist in v2.x because the dark background made almost any brand colour legible — on white it does not.

### 2.4 Text Colours

Slate ramp, matching the web app (`text-slate-900` body default set on `<body>`).

```css
--color-text-primary:    #0F172A;   /* slate-900 — headings, active labels */
--color-text-secondary:  #475569;   /* slate-600 — body copy, descriptions */
--color-text-muted:      #94A3B8;   /* slate-400 — placeholders, timestamps */
--color-text-disabled:   #CBD5E1;   /* slate-300 — disabled labels */
--color-text-link:       #2563EB;   /* brand-500 — inline links */
--color-text-brand:      #1D4ED8;   /* brand-600 — brand-coloured text on white */
--color-text-on-brand:   #FFFFFF;   /* text on brand gradient fills */
```

Semantic text (`-700` shades — matches `.status-*` classes in `globals.css`):
```css
--color-text-success:  #047857;   /* emerald-700 */
--color-text-warning:  #B45309;   /* amber-700 */
--color-text-error:    #B91C1C;   /* red-700 */
--color-text-info:     #0E7490;   /* cyan-700 */
```

### 2.5 Status Colours

The web app defines three status triads in `globals.css` — `.status-active`, `.status-expiring`, `.status-expired`. Those three are **binding**; the PWA extends the pattern to the remaining statuses using the same `50 / 200 / 700` formula.

```css
/* ── Inherited verbatim from the web app ───────────────────── */
--color-active-bg:      #ECFDF5;  --color-active-border:      #A7F3D0;  --color-active-text:      #047857;
--color-expiring-bg:    #FFFBEB;  --color-expiring-border:    #FDE68A;  --color-expiring-text:    #B45309;
--color-expired-bg:     #FEF2F2;  --color-expired-border:     #FECACA;  --color-expired-text:     #B91C1C;

/* ── PWA extensions, same 50/200/700 formula ───────────────── */
--color-pending-bg:     #FFFBEB;  --color-pending-border:     #FDE68A;  --color-pending-text:     #B45309;
--color-paused-bg:      #F8FAFC;  --color-paused-border:      #E2E8F0;  --color-paused-text:      #475569;
--color-renewed-bg:     #ECFDF5;  --color-renewed-border:     #A7F3D0;  --color-renewed-text:     #047857;
--color-trial-bg:       #ECFEFF;  --color-trial-border:       #A5F3FC;  --color-trial-text:       #0E7490;
--color-premium-bg:     #F5F3FF;  --color-premium-border:     #DDD6FE;  --color-premium-text:     #6D28D9;
--color-vip-bg:         #FFFBEB;  --color-vip-border:         #FDE68A;  --color-vip-text:         #92400E;
--color-verified-bg:    #EFF6FF;  --color-verified-border:    #BFDBFE;  --color-verified-text:    #1D4ED8;
--color-locked-bg:      #F8FAFC;  --color-locked-border:      #E2E8F0;  --color-locked-text:      #64748B;
--color-new-bg:         #EFF6FF;  --color-new-border:         #BFDBFE;  --color-new-text:         #1D4ED8;
--color-inactive-bg:    #F8FAFC;  --color-inactive-border:    #E2E8F0;  --color-inactive-text:    #94A3B8;
```

Always use all three of a triad together:
```css
.badge-active {
  background: var(--color-active-bg);
  border:     1px solid var(--color-active-border);
  color:      var(--color-active-text);
}
```

> **Naming note:** v2.x called the 7–14 day state `warning`. The web app calls it **`expiring`**. Use `expiring` so the two codebases share vocabulary; `--color-warning-*` remains as an alias for generic non-membership warnings.

### 2.6 Gamification Colours

Gamification is the PWA's own territory — the web app has no equivalent. But the colours must survive on **white**, so each is defined as a `text / bg / border` triad rather than a single neon value. Use the `-600`/`-700` shade for text and icons; never place the raw `-400` value as text on white.

```css
/* XP — amber */
--color-xp:         #D97706;  --color-xp-bg:      #FFFBEB;  --color-xp-border:      #FDE68A;  --color-xp-text:      #B45309;
/* Streak — orange */
--color-streak:     #EA580C;  --color-streak-bg:  #FFF7ED;  --color-streak-border:  #FED7AA;  --color-streak-text:  #C2410C;
/* Badge — violet */
--color-badge:      #7C3AED;  --color-badge-bg:   #F5F3FF;  --color-badge-border:   #DDD6FE;  --color-badge-text:   #6D28D9;
/* Level — brand blue */
--color-level:      #2563EB;  --color-level-bg:   #EFF6FF;  --color-level-border:   #BFDBFE;  --color-level-text:   #1D4ED8;
/* Achievement — pink */
--color-achievement:#DB2777;  --color-achievement-bg: #FDF2F8; --color-achievement-border: #FBCFE8; --color-achievement-text: #BE185D;
/* Challenge — teal */
--color-challenge:  #0D9488;  --color-challenge-bg: #F0FDFA; --color-challenge-border: #99F6E4; --color-challenge-text: #0F766E;
/* Reward — warm amber */
--color-reward:     #F59E0B;  --color-reward-bg:  #FFFBEB;  --color-reward-border:  #FDE68A;  --color-reward-text:  #B45309;

/* Leaderboard medals — used as icon fills, not text */
--color-leaderboard-gold:   #D97706;
--color-leaderboard-silver: #64748B;
--color-leaderboard-bronze: #B45309;
--color-victory:            #D97706;
```

**Glow → tint substitution.** v2.x used neon `--shadow-xp` / `--shadow-streak` / `--shadow-badge` glows that read as blur on a white page. On light surfaces:

| Moment | v2.x (dark) | v3.0 (light) |
|---|---|---|
| XP card | Gold neon glow | `--color-xp-bg` fill + `--color-xp-border` + `--shadow-sm` |
| Streak card | Orange neon glow | `--color-streak-bg` fill + `--color-streak-border` + `--shadow-sm` |
| Badge earn | Purple neon glow | `--color-badge-bg` fill + `--shadow-md` + scale-in animation |
| Level-up hero | Glow burst | `--gradient-xp` fill on a **dark** full-screen celebration overlay (`--color-auth-bg`) — the one place neon still works |

The soft coloured shadows the web app already uses (`hover:shadow-lg hover:shadow-brand-200`) are the correct light-mode analogue of a glow. Reuse that idiom:
```css
--shadow-xp:     0 4px 12px rgba(217, 119, 6, 0.18);
--shadow-streak: 0 4px 12px rgba(234, 88, 12, 0.18);
--shadow-badge:  0 4px 12px rgba(124, 58, 237, 0.18);
--shadow-brand:  0 4px 12px rgba(37, 99, 235, 0.18);   /* ≈ shadow-brand-200 */
```

### 2.7 Colour Scheme Declaration

The PWA is **light-mode primary**, matching the web app. There is no user-facing dark toggle in v1.

```css
:root { color-scheme: light; }
```

Auth screens opt into dark locally via a `.theme-auth` wrapper class that reassigns `--color-bg`, `--color-surface`, `--color-text-*`, and `--color-border` — they do not flip a global attribute. Set `<meta name="theme-color">` per route: `#020617` on auth, `#2563EB` elsewhere.

---

## 3. Typography

**Sora**, matching the web app (`next/font/google` → `--font-sora`, applied via Tailwind's `fontFamily.sans`).

```css
--font-display:  var(--font-sora), system-ui, sans-serif;
--font-heading:  var(--font-sora), system-ui, sans-serif;
--font-body:     var(--font-sora), system-ui, sans-serif;
--font-mono:     'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
```

Load it identically to the web app so the two share a cached font:
```javascript
import { Sora } from 'next/font/google'
const sora = Sora({ subsets: ['latin'], variable: '--font-sora' })
```

> Sora is geometric and slightly wider than Inter. Two consequences: (1) `--tracking-tight` on hero numerals matters more, not less; (2) long Tamil/English member names wrap sooner — test the membership card and leaderboard at 360px.

### 3.1 Type Scale

| Role | Token | Size | Weight Token | Line Height Token |
|---|---|---|---|---|
| Hero stat | `--font-size-hero` | 48px | `--weight-bold` (700) | `--leading-none` (1) |
| Display | `--font-size-display` | 36px | `--weight-bold` (700) | `--leading-tight` (1.25) |
| H1 | `--font-size-h1` | 30px | `--weight-bold` (700) | `--leading-tight` (1.25) |
| H2 | `--font-size-h2` | 24px | `--weight-semibold` (600) | `--leading-snug` (1.375) |
| H3 | `--font-size-h3` | 20px | `--weight-semibold` (600) | `--leading-snug` (1.375) |
| H4 | `--font-size-h4` | 18px | `--weight-medium` (500) | `--leading-normal` (1.5) |
| Body | `--font-size-body` | 16px | `--weight-regular` (400) | `--leading-relaxed` (1.625) |
| Body small | `--font-size-body-sm` | 14px | `--weight-regular` (400) | `--leading-normal` (1.5) |
| Caption | `--font-size-caption` | 12px | `--weight-regular` (400) | `--leading-normal` (1.5) |
| Micro label | `--font-size-micro` | 10px | `--weight-bold` (700) | `--leading-none` (1) |
| Label | `--font-size-label` | 14px | `--weight-semibold` (600) | `--leading-tight` (1.25) |
| Button | `--font-size-button` | 14px | `--weight-semibold` (600) | `--leading-none` (1) |
| Stat | `--font-size-stat` | 30px | `--weight-bold` (700) | `--leading-tight` (1.25) |
| Code / member ID | `--font-size-code` | 14px | `--weight-regular` (400) | `--leading-normal` (1.5) |

> `--font-size-micro` (10px bold uppercase) is new in v3.0 — it matches the web app's "SOON" pills and status chips (`text-[10px] font-bold uppercase tracking-wider`).

> **Display numbers** (XP totals, step counts, weight): `--font-size-hero` + `--weight-bold` + `--tracking-tight`.

### 3.2 Letter Spacing

```css
--tracking-tight:   -0.025em;  /* Display headings, hero stats */
--tracking-normal:   0em;      /* Body copy */
--tracking-wide:     0.025em;  /* Uppercase labels, overlines */
--tracking-widest:   0.1em;    /* Micro labels (e.g. "STREAK", "MENU") */
```

### 3.3 Mono Usage

`--font-mono` exclusively for: member codes, QR labels, biometric codes, timer displays.

---

## 4. Spacing System

Base unit 8px, unchanged from v2.x — it already agrees with Tailwind's default scale used by the web app.

```
--space-2:   4px   — xs  (icon + label gap)
--space-4:   8px   — sm  (inner padding, small components)
--space-6:   12px  — md  (card inner padding, button padding-y)
--space-8:   16px  — lg  (standard section padding, page horizontal padding)
--space-10:  20px  — xl
--space-12:  24px  — 2xl (between card sections)
--space-16:  32px  — 3xl (page vertical margins)
--space-24:  48px  — 4xl (hero section spacing)
```

**Page horizontal padding** — the web app uses `px-4 xs:px-5` on mobile shells, so the PWA adds an `xs` step:

```css
.page-container { padding-inline: var(--space-8); }              /* 16px, < 360px */
@media (min-width: 360px) { .page-container { padding-inline: var(--space-10); } }  /* 20px */
@media (min-width: 640px) { .page-container { padding-inline: var(--space-12); } }  /* 24px */
```

**Breakpoints** — inherited from the web app's `screens` extension:
```css
--screen-xs:  360px;   /* small phones — iPhone SE, Galaxy A */
--screen-sm:  640px;
--screen-md:  768px;
--screen-lg:  1024px;
--screen-xl:  1280px;
--screen-2xl: 1536px;
--screen-3xl: 1920px;
```

The web app enforces `min-width: 320px` on `<body>` and `overflow-x: hidden` on `html, body`. The PWA does the same.

**Named aliases:**
```css
--padding-card:      var(--space-8);   /* 16px */
--padding-modal:     var(--space-10);  /* 20px */
--padding-button-x:  var(--space-8);   /* 16px — matches web app px-4 */
--padding-button-y:  var(--space-6);   /* 12px — matches web app py-3 */
--padding-input-x:   var(--space-7);   /* 14px — matches web app px-3.5 */
--padding-input-y:   var(--space-5);   /* 10px — matches web app py-2.5 */
--padding-section:   var(--space-12);  /* 24px */
```

---

## 5. Component Library

### 5.0 Radius Scale

The web app uses `rounded-xl` (12px) almost universally for buttons, inputs, cards, and icon tiles, with `rounded-t-3xl` (24px) for the mobile drawer and `rounded-full` for pills. **v3.0 corrects the v2.x radius mapping to match.**

```css
--radius-sm:    6px;
--radius-md:    8px;
--radius-lg:    12px;   /* rounded-xl — the default for buttons, inputs, cards */
--radius-xl:    16px;   /* rounded-2xl — feature cards, membership card */
--radius-2xl:   20px;
--radius-3xl:   24px;   /* bottom sheet top corners */
--radius-full:  9999px; /* pills, avatars, progress tracks */

--radius-card:   var(--radius-lg);
--radius-button: var(--radius-lg);
--radius-input:  var(--radius-lg);
--radius-badge:  var(--radius-full);
```

> v2.x said "`--radius-xl` = 16px, use for cards". The web app's `.card` is `rounded-xl` = **12px**. Cards now use `--radius-lg`. Only hero/feature cards step up to `--radius-xl`.

### 5.1 Cards

Mirrors `.card` in the web app's `globals.css`: `bg-white rounded-xl border border-slate-200 shadow-sm`.

```
┌─────────────────────────────────────────┐
│  ← var(--padding-card) all sides       │
│                                         │
│  [Icon/Avatar]   Title                  │
│                  Subtitle               │
│                                         │
│  Content area                           │
│                                         │
└─────────────────────────────────────────┘
```

```css
.card {
  background:    var(--color-surface);      /* #FFFFFF */
  border:        var(--border-default);     /* 1px solid #E2E8F0 */
  border-radius: var(--radius-card);        /* 12px */
  box-shadow:    var(--shadow-sm);
  padding:       var(--padding-card);
  transition:    var(--transition-card);
}
.card:hover {
  border-color: var(--border-color-strong);  /* #CBD5E1 */
  box-shadow:   var(--shadow-md);
}
```

**Variants:**

| Class | Background | Border | Shadow | Use |
|---|---|---|---|---|
| `card-default` | `--color-surface` | `--border-default` | `--shadow-sm` | Standard info card |
| `card-elevated` | `--color-surface` | `--border-default` | `--shadow-md` | Floating content, dropdowns |
| `card-brand` | `--gradient-brand` | none | `--shadow-brand` | Membership status, primary CTAs — white text |
| `card-glass` | `--glass-bg` | `--glass-border` | `--shadow-md` | Overlays on the membership card hero only |
| `card-highlight` | `--color-surface` | `--border-default` | `--shadow-sm` | + `border-left: 3px solid var(--color-brand)` |
| `card-xp` | `--color-xp-bg` | `--color-xp-border` | `--shadow-xp` | XP moments |
| `card-streak` | `--color-streak-bg` | `--color-streak-border` | `--shadow-streak` | Streak milestones |
| `card-sunken` | `--color-surface-sunken` | none | `inset` | Stat wells, inline metrics |

> On white, an "elevated" card is **not** a lighter background — it is the same white with a deeper shadow. Never introduce grey card backgrounds to imply elevation; that reads as "disabled" in the web app's vocabulary.

### 5.2 Buttons

The web app's `.btn-primary` is the reference implementation. Ported here with the touch-target height raised to 48px for mobile.

```css
/* Primary — gradient, matches web app exactly */
.btn-primary {
  display:         flex;
  align-items:     center;
  justify-content: center;
  gap:             var(--space-4);
  height:          48px;
  padding-inline:  var(--padding-button-x);
  background:      var(--gradient-button);        /* brand-500 → brand-600, to right */
  color:           var(--color-text-on-brand);
  border-radius:   var(--radius-button);          /* 12px */
  font-size:       var(--font-size-button);       /* 14px */
  font-weight:     var(--weight-semibold);        /* 600 */
  box-shadow:      var(--shadow-brand);
  transition:      var(--transition-hover);
}
.btn-primary:hover         { background: var(--gradient-button-hover); }  /* brand-600 → brand-700 */
.btn-primary:active        { transform: scale(0.98); transition: var(--transition-press); }
.btn-primary:focus-visible { box-shadow: var(--focus-ring); }
.btn-primary:disabled      { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

/* Secondary — white with border, matches web app .btn-secondary */
.btn-secondary {
  background:    var(--color-surface);
  color:         var(--color-text-secondary);
  border:        var(--border-default);
  border-radius: var(--radius-button);
  box-shadow:    var(--shadow-sm);
  font-weight:   var(--weight-semibold);
}
.btn-secondary:hover  { background: var(--color-surface-hover); }
.btn-secondary:active { transform: scale(0.98); }

/* Ghost — matches web app .btn-ghost */
.btn-ghost {
  background: transparent;
  color:      var(--color-text-muted);
  border:     none;
  padding:    var(--space-4) var(--space-6);
}
.btn-ghost:active { background: var(--color-surface-pressed); }

/* Danger — matches the web app's outlined destructive style */
.btn-danger {
  background:    var(--color-surface);
  color:         var(--color-text-error);
  border:        2px solid var(--color-expired-border);
  border-radius: var(--radius-button);
  font-weight:   var(--weight-bold);
}
.btn-danger:hover { background: var(--color-expired-bg); }
```

> **Disabled state changed.** v2.x specified `--color-disabled-bg` + `--color-disabled-text`. The web app uses `disabled:opacity-50 disabled:cursor-not-allowed` and keeps the gradient. Match the web app — it's simpler and avoids a grey fill that collides with `card-sunken`.

**States:**

| State | Visual |
|---|---|
| Default | Base styles above |
| Hover | Gradient darkens one step via `--gradient-button-hover` |
| Pressed | `transform: scale(0.98)` using `--transition-press` |
| Focused | `box-shadow: var(--focus-ring)` |
| Disabled | `opacity: 0.5`, `cursor: not-allowed` |
| Loading | Replace label with spinner; add `aria-busy="true"`; disable pointer events |
| Success | Brief checkmark animation (`--duration-slow`) then reset |

> The web app's tap-scale is **0.98**, not 0.95. v3.0 adopts 0.98 for buttons and cards so the whole product feels consistent under the thumb.

### 5.3 Bottom Navigation

The web app ships a `BottomNav` component (currently commented out in `components/layout/BottomNav.tsx`) whose pattern the PWA should adopt and finish: white bar, top border, `brand-600` active, `slate-400` inactive, thicker icon stroke when active.

```
┌────────────────────────────────────────────┐
│  Home   Workout  Progress  Rewards  Profile │
│   ●                                        │ ← active tab indicator
└────────────────────────────────────────────┘
  ↑ height: var(--bottom-nav-height) + var(--pwa-safe-bottom)
```

```css
.bottom-nav {
  height:          calc(var(--bottom-nav-height) + var(--pwa-safe-bottom));
  background:      rgba(255, 255, 255, 0.90);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-top:      1px solid var(--border-color-default);   /* slate-200 */
  z-index:         var(--z-sticky);
  padding-bottom:  var(--pwa-safe-bottom);
}
.bottom-nav__item {
  color:      var(--color-text-muted);   /* slate-400 */
  min-width:  48px;
  min-height: 48px;
  transition: var(--transition-color);
}
.bottom-nav__item--active {
  color:       var(--color-brand-600);
  font-weight: var(--weight-semibold);
}
.bottom-nav__item--active svg { stroke-width: 2.5; }   /* web app idiom */
.bottom-nav__badge {
  background:    var(--color-text-error);
  border-radius: var(--radius-full);
  min-width:     8px;
  height:        8px;
}
```

> The web app's own mobile pattern is a **slide-up drawer** (`rounded-t-3xl`, drag handle, `MENU` overline) triggered from a hamburger — because owners have 8 destinations. Members have 5, so a persistent bottom nav is correct. Reuse the drawer styling for the PWA's secondary sheets (Section 8.3) so the two still rhyme.

### 5.4 Progress Bars

Track colour changed from a dark border to the web app's `slate-100` well.

```css
.progress-bar {
  height:        8px;
  background:    var(--color-surface-sunken);   /* #F1F5F9 */
  border-radius: var(--radius-full);
  overflow:      hidden;
}
.progress-fill {
  height:        100%;
  background:    var(--gradient-brand-h);
  border-radius: var(--radius-full);
  transition:    width var(--duration-slow) var(--ease-bounce);
}
```

Membership urgency — vocabulary now matches the web app's `.status-*` naming:
```css
.progress-fill--expired  { background: var(--gradient-error);  }   /* < 7 days  */
.progress-fill--expiring { background: var(--gradient-streak); }   /* 7–14 days */
.progress-fill--active   { background: var(--gradient-brand-h);}   /* > 14 days */
```

The web app already defines an `animate-fill-bar` keyframe (`width: 0 → 100%`, 0.6s ease-out). Reuse it for first paint rather than writing a new one.

### 5.5 XP Bar

```
Level 5  ████████████░░░░  2,340 / 3,000 XP  → Level 6
         [--gradient-xp: amber-500 → amber-600]
```

```css
.xp-bar {
  background:    var(--color-surface-sunken);
  border-radius: var(--radius-full);
}
.xp-bar-fill {
  background: var(--gradient-xp);
  box-shadow: var(--shadow-xp);
  transition: width var(--duration-slow) var(--ease-bounce);
}
.xp-label {
  color:       var(--color-xp-text);    /* #B45309 — readable on white */
  font-size:   var(--font-size-caption);
  font-weight: var(--weight-semibold);
}
```

### 5.6 Streak Counter

```
┌───────────────┐
│  🔥  14       │   ← font-size: var(--font-size-stat)
│  Day Streak   │   ← font-size: var(--font-size-caption)
└───────────────┘
```

```css
.streak-card {
  background:    var(--color-streak-bg);      /* #FFF7ED */
  border:        1px solid var(--color-streak-border);
  border-radius: var(--radius-card);          /* 12px */
  box-shadow:    var(--shadow-streak);
  color:         var(--color-streak-text);
}
.streak-count {
  font-size:   var(--font-size-stat);
  font-weight: var(--weight-bold);
  color:       var(--color-streak);           /* #EA580C */
}
```

Flame pulse when `streak > 0` — CSS only. Drop the `brightness()` boost from v2.x; it washes out on white.

```css
@keyframes streak-pulse {
  0%, 100% { transform: scale(1);    }
  50%      { transform: scale(1.12); }
}
.streak-icon--active { animation: streak-pulse 2s var(--ease-standard) infinite; }
```

### 5.7 Stats Pills

Horizontally scrollable. Use the web app's existing `.no-scrollbar` utility rather than redefining scrollbar hiding.

```css
.stat-pill {
  background:    var(--color-surface);
  border:        var(--border-default);
  border-radius: var(--radius-full);
  box-shadow:    var(--shadow-sm);
  padding:       var(--space-3) var(--space-6);
  font-size:     var(--font-size-body-sm);
  font-weight:   var(--weight-medium);
  color:         var(--color-text-secondary);
  white-space:   nowrap;
  flex-shrink:   0;
}
.stat-pill--active {
  background:   var(--color-surface-selected);   /* brand-50 */
  border-color: var(--color-brand-200);
  color:        var(--color-text-brand);
}
```

### 5.8 Input Fields

Mirrors `.input-field` in the web app: white, slate-200 border, `rounded-xl`, `focus:ring-2 ring-brand-400`.

```css
.input {
  width:         100%;
  background:    var(--color-surface);
  border:        var(--border-default);
  border-radius: var(--radius-input);              /* 12px */
  padding:       var(--padding-input-y) var(--padding-input-x);
  font-size:     var(--font-size-body);            /* 16px — prevents iOS zoom */
  color:         var(--color-text-primary);
  box-shadow:    var(--shadow-sm);
  height:        48px;
  transition:    var(--transition-hover);
}
.input::placeholder { color: var(--color-text-muted); }
.input:hover        { border-color: var(--border-color-strong); }
.input:focus {
  outline:      none;
  border-color: transparent;
  box-shadow:   var(--focus-ring);                 /* 2px brand-400 ring */
}
.input--error { border: var(--border-error); box-shadow: var(--focus-ring-error); }
```

> Keep inputs at **16px** font size. The web app uses `text-sm` (14px) because it's desktop-first; on iOS Safari, sub-16px inputs trigger an auto-zoom on focus. This is a deliberate, documented divergence.

### 5.9 Badges / Status Chips

```css
.badge {
  display:       inline-flex;
  align-items:   center;
  gap:           var(--space-2);
  padding:       var(--badge-padding-y) var(--badge-padding-x);
  border-radius: var(--radius-full);
  font-size:     var(--font-size-caption);
  font-weight:   var(--weight-semibold);
  line-height:   var(--leading-none);
}
.badge--micro {                      /* web app "SOON" pill idiom */
  font-size:      var(--font-size-micro);   /* 10px */
  font-weight:    var(--weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  border-radius:  var(--radius-md);
}

/* Status variants — always use the triad */
.badge--active   { background: var(--color-active-bg);   border: 1px solid var(--color-active-border);   color: var(--color-active-text);   }
.badge--expiring { background: var(--color-expiring-bg); border: 1px solid var(--color-expiring-border); color: var(--color-expiring-text); }
.badge--expired  { background: var(--color-expired-bg);  border: 1px solid var(--color-expired-border);  color: var(--color-expired-text);  }
.badge--trial    { background: var(--color-trial-bg);    border: 1px solid var(--color-trial-border);    color: var(--color-trial-text);    }
.badge--premium  { background: var(--color-premium-bg);  border: 1px solid var(--color-premium-border);  color: var(--color-premium-text);  }
.badge--vip      { background: var(--color-vip-bg);      border: 1px solid var(--color-vip-border);      color: var(--color-vip-text);      }
.badge--pending  { background: var(--color-pending-bg);  border: 1px solid var(--color-pending-border);  color: var(--color-pending-text);  }
```

### 5.10 Skeleton Loaders

The web app already defines `.skeleton` in `globals.css` — `bg-slate-100` with a **white** shimmer sweep at 1.4s. Copy it verbatim; do not ship a second shimmer.

```css
.skeleton {
  position:      relative;
  overflow:      hidden;
  background:    var(--color-surface-sunken);   /* slate-100 */
  border-radius: var(--radius-md);
}
.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%);
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

```html
<div class="card">
  <div class="skeleton" style="height: 20px; width: 60%; margin-bottom: var(--space-4);"></div>
  <div class="skeleton" style="height: 14px; width: 40%;"></div>
</div>
```

> `--duration-shimmer` is **1400ms** in v3.0, down from 1600ms, to match the web app.

### 5.11 Toast Notifications

The web app uses `react-hot-toast` positioned **top-right** with a 4s duration. The PWA uses the same library but positions **top-center** — top-right on a 375px viewport crowds the status bar and clips on notched devices.

```css
.toast {
  background:    var(--color-surface);
  border:        var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow:    var(--shadow-float);
  padding:       var(--space-6) var(--space-8);
  z-index:       var(--z-toast);
  font-size:     var(--font-size-body-sm);
  color:         var(--color-text-primary);
}
.toast--error   { border-left: 3px solid var(--color-text-error);   }
.toast--success { border-left: 3px solid var(--color-text-success); }
.toast--warning { border-left: 3px solid var(--color-text-warning); }
.toast--info    { border-left: 3px solid var(--color-text-info);    }
```

```javascript
<Toaster position="top-center" toastOptions={{ duration: 4000 }} />
```

### 5.12 Route Progress Bar

The web app shows a `nextjs-toploader` bar in `#2563EB` with a matching glow. The PWA does the same so navigation feels identical across products.

```javascript
<NextTopLoader color="#2563EB" height={3} showSpinner={false}
  shadow="0 0 10px #2563EB,0 0 5px #2563EB" />
```

---

## 6. Elevation System

On light surfaces elevation is **shadow + border**, never background darkening. The `bg` slot stays white at every level.

| Level | Background | Border | Shadow | Use |
|---|---|---|---|---|
| 0 | `--color-bg` | none | none | Page background |
| 1 | `#FFFFFF` | `--border-default` | `--shadow-sm` | Base cards, list items, inputs |
| 2 | `#FFFFFF` | `--border-default` | `--shadow-md` | Floating cards, dropdowns, date pickers |
| 3 | `#FFFFFF` | `--border-subtle` | `--shadow-lg` | Modals, bottom sheets, drawers |
| 4 | `#FFFFFF` | none | `--shadow-float` | Dialogs, tooltips, confirmation overlays |

```css
--shadow-sm:    0 1px 2px 0 rgba(15, 23, 42, 0.05);
--shadow-md:    0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.05);
--shadow-lg:    0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.05);
--shadow-float: 0 20px 25px -5px rgba(15, 23, 42, 0.10), 0 8px 10px -6px rgba(15, 23, 42, 0.05);
```

```css
.card         { background: var(--elevation-1-bg); border: var(--elevation-1-border); box-shadow: var(--elevation-1-shadow); }
.bottom-sheet { background: var(--elevation-3-bg); border: var(--elevation-3-border); box-shadow: var(--elevation-3-shadow); }
```

---

## 7. Border System

Slate ramp, matching `colors.surface.border` (`#E2E8F0`) in the web app.

```css
--border-color-subtle:   #F1F5F9;   /* slate-100 — hairline dividers */
--border-color-default:  #E2E8F0;   /* slate-200 — standard card border */
--border-color-strong:   #CBD5E1;   /* slate-300 — hover, focused card */
--border-color-stronger: #94A3B8;   /* slate-400 — high emphasis */

--border-subtle:   1px solid var(--border-color-subtle);
--border-default:  1px solid var(--border-color-default);
--border-strong:   1px solid var(--border-color-strong);
--border-stronger: 1px solid var(--border-color-stronger);
--border-brand:    1px solid var(--color-brand-200);   /* #BFDBFE */
--border-error:    1px solid var(--color-expired-border);
--border-focus:    2px solid var(--color-brand-400);   /* #60A5FA */
```

**Rules:**
- Dividers between list items: `--border-subtle` (the web app uses `border-slate-100`)
- All card defaults: `--border-default`
- Card on hover/focus: `--border-strong`
- Modal containers: `--border-subtle` — at elevation 3 the shadow carries the separation; a strong border looks heavy on white
- Brand-accented highlights: `--border-brand`
- Focus rings always use `--focus-ring` (box-shadow), never `outline`

---

## 8. Navigation

### 8.1 Bottom Navigation (primary)

5 tabs: Home, Workout, Progress, Rewards, Profile. No header on mobile.

Z-index `var(--z-sticky)`. Height `calc(var(--bottom-nav-height) + var(--pwa-safe-bottom))`. The web app already exposes `.pb-safe-bottom` / `.pt-safe-top` utilities wrapping `env(safe-area-inset-*)` — reuse those names rather than inventing new ones.

```css
--pwa-safe-bottom: env(safe-area-inset-bottom, 0px);
--pwa-safe-top:    env(safe-area-inset-top, 0px);
```

### 8.2 Back Navigation

Browser/OS back gesture is primary. Provide a `←` back button in secondary views using `.btn-ghost`. Touch target minimum 44×44px — the web app's `.tap-target` utility (`min-w-[44px] min-h-[44px]`) is the shared implementation.

### 8.3 Bottom Sheets (Modal Sheets)

Adopt the web app's mobile drawer styling directly — `rounded-t-3xl`, a `w-10 h-1 bg-slate-200 rounded-full` drag handle, and an uppercase overline header.

```css
.sheet {
  background:    var(--color-surface);
  border-radius: var(--radius-3xl) var(--radius-3xl) 0 0;   /* 24px top corners */
  box-shadow:    var(--shadow-float);
  z-index:       var(--z-modal);
}
.sheet-handle {
  width:         40px;
  height:        4px;
  background:    var(--border-color-default);
  border-radius: var(--radius-full);
  margin:        var(--space-6) auto var(--space-2);
}
.sheet-header {
  font-size:      var(--font-size-body-sm);
  font-weight:    var(--weight-bold);
  color:          var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  border-bottom:  var(--border-subtle);
}
.sheet-overlay {
  background:      var(--color-overlay);      /* slate-900/40 */
  backdrop-filter: var(--color-overlay-blur); /* blur(4px) */
  z-index:         var(--z-overlay);
}
```

Sheet heights:
- Short: 40vh — quick confirmations, single-action
- Medium: 65vh — forms, filters, selection lists
- Tall: 90vh — complex flows, multi-step

Slide-up animation: `transform var(--duration-drawer) var(--ease-emphasized)` (300ms, matching the web app's `duration-300 ease-out` drawer).

### 8.4 Z-Index Stack

Always use tokens — never raw z-index in components:

```css
--z-dropdown: 100;
--z-sticky:   200;
--z-overlay:  300;
--z-modal:    400;
--z-popover:  500;
--z-toast:    700;
```

> The web app currently uses raw `z-[9998]` / `z-[9999]` for its mobile drawer. That is a known wart, not a pattern to copy — the PWA uses the scale above, and the web app should migrate to it.

---

## 9. Motion & Animation

All animations use duration and easing tokens and respect `prefers-reduced-motion` via the global rule in `design-tokens.css`.

### 9.1 Reuse Before You Write

The web app's `globals.css` already ships these keyframes. Port them into `design-tokens.css` unchanged rather than authoring near-duplicates:

| Keyframe | Utility | Use in PWA |
|---|---|---|
| `shimmer` | `.skeleton` | All loading states |
| `pop-in` | `.animate-pop-in` | Badge earn, achievement unlock |
| `slide-up` | `.animate-slide-up` | Page enter, card stagger |
| `fill-bar` | `.animate-fill-bar` | Progress + XP bar first paint |
| `pulse-soft` | `.animate-pulse-soft` | Live/active indicators |
| `bounce-dots` | `.animate-bounce-dot` | Inline "thinking" states |
| `spin-slow` | `.animate-spin-slow` | Button spinners |
| `progress-bar` | `.animate-progress-bar` | Indeterminate long operations |

### 9.2 Transition Presets

```css
--transition-hover   /* Color, bg, border, shadow changes */
--transition-press   /* Scale on tap/click */
--transition-card    /* Card hover elevation shift */
--transition-dialog  /* Modal/sheet open/close */
--transition-drawer  /* Drawer slide */
--transition-fade    /* Opacity fade in/out */
--transition-page    /* Route-level page transition */
```

### 9.3 Animation Reference Table

| Interaction | Behaviour | Duration Token | Easing Token |
|---|---|---|---|
| Page transition | Slide up + fade in | `--duration-page` (350ms) | `--ease-decelerate` |
| Card tap | Scale to 0.98 | `--duration-fast` (100ms) | `--ease-snap` |
| Button tap | Scale to 0.98 | `--duration-fast` (100ms) | `--ease-snap` |
| Bottom sheet open | Slide up from bottom | `--duration-drawer` (300ms) | `--ease-emphasized` |
| Dialog open | Fade + scale from 0.95 | `--duration-dialog` (250ms) | `--ease-decelerate` |
| XP gain | Counter increment + tint pulse | `--duration-slower` (500ms) | `--ease-standard` |
| Badge earn | Scale in + confetti burst | 1000ms | `--ease-bounce` |
| Streak milestone | Shake + pulse | `--duration-slow` (400ms) | `--ease-bounce` |
| Set complete | Checkmark draw | `--duration-slow` (400ms) | `--ease-standard` |
| Progress bar fill | Width expand | `--duration-slow` (400ms) | `--ease-bounce` |
| Skeleton shimmer | Continuous sweep | `--duration-shimmer` (1400ms) | `--ease-linear` |
| Toast enter | Slide down + fade | `--duration-normal` (200ms) | `--ease-decelerate` |
| Toast exit | Slide up + fade | `--duration-fast` (100ms) | `--ease-accelerate` |

### 9.4 Micro-interactions

- **Workout set complete:** Checkbox draws a green checkmark via SVG stroke animation. Row background shifts briefly to `--color-active-bg`. `--duration-slow` + `--ease-standard`.
- **XP earned:** Floating `+50 XP` text in `--color-xp-text` at `--font-size-body-sm`. Rises 24px and fades. `--duration-slower` + `--ease-accelerate`.
- **Badge earned:** Full-screen overlay using `--color-auth-bg` (dark) so the badge and confetti pop — this is the sanctioned dark moment inside an otherwise light app. Badge scales 0.5 → 1.0 with `--ease-bounce`.
- **Streak milestone:** Flame pulses via `@keyframes streak-pulse` (5.6). Brief `navigator.vibrate([30, 10, 30])`.
- **XP bar on level-up:** Fill completes to 100%, resets to 0, refills to new level progress.

### 9.5 Motion Rules

1. **Never animate for decoration** — every animation communicates a state change
2. **Maximum 3 concurrent animations** per screen
3. **Hover behaviour:** `--transition-hover` on all interactive elements
4. **Page transitions:** `--transition-page`; avoid abrupt cuts
5. **Loading states:** skeleton shimmer only; spinners only inside buttons
6. **Reduced motion:** handled globally — no per-component overrides

---

## 10. Glassmorphism

The web app's `.glass` is `bg-white/80 backdrop-blur-md border border-white/20` — light frosted, not dark. v3.0 matches, and narrows where glass is permitted.

```css
--glass-bg:      rgba(255, 255, 255, 0.80);
--glass-border:  rgba(255, 255, 255, 0.20);
--glass-blur:    blur(12px);      /* backdrop-blur-md */
--glass-blur-lg: blur(16px);

/* Brand-tinted glass — for the membership card hero only */
--glass-brand-bg:     rgba(255, 255, 255, 0.16);
--glass-brand-border: rgba(255, 255, 255, 0.28);
```

**Rules:**
- Permitted on exactly three surfaces: the bottom nav, the membership card inner panel, and the auth screens' orb background. Nowhere else.
- Never on flat white — glass over white is invisible and costs a compositing layer for nothing
- Never blur beyond `--glass-blur-lg` (16px)
- Always pair with a semi-opaque background; pure transparent + blur performs badly on low-end Android
- Test on a real device — blur differs significantly from desktop Chrome

---

## 11. Charts & Data Visualisation

Series colours are re-saturated for white backgrounds. The v2.x values were `-400` shades tuned for dark; on white they read as pastel and fail 3:1 against the page.

```css
--chart-weight:      #2563EB;   /* Weight over time — brand blue */
--chart-attendance:  #059669;   /* Attendance frequency — emerald-600 */
--chart-revenue:     #7C3AED;   /* (admin-facing) Revenue — violet-600 */
--chart-workout:     #EA580C;   /* Workout completion % — orange-600 */
--chart-calories:    #DB2777;   /* Calorie intake — pink-600 */
--chart-bmi:         #D97706;   /* BMI tracking — amber-600 */
--chart-measurements:#0891B2;   /* Body measurements — cyan-600 */
```

Chart infrastructure:
```css
--chart-grid:           #F1F5F9;   /* slate-100 grid lines */
--chart-axis:           #E2E8F0;   /* slate-200 axis lines */
--chart-label:          #94A3B8;   /* slate-400 axis labels */
--chart-tooltip-bg:     #FFFFFF;
--chart-tooltip-border: #E2E8F0;
--chart-tooltip-shadow: var(--shadow-lg);
```

**Recharts:**
```jsx
<CartesianGrid stroke="var(--chart-grid)" />
<XAxis tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
<Tooltip
  contentStyle={{
    background:   'var(--chart-tooltip-bg)',
    border:       '1px solid var(--chart-tooltip-border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow:    'var(--shadow-lg)',
  }}
/>
```

**Colour-blind rules:**
- Never use red + green as the only distinguishing factor between two series
- Always pair colour with a secondary cue (line style, shape marker, or label)
- The 8-series palette (`--chart-series-1` → `--chart-series-8`) is Okabe-Ito-inspired and safe for the three major forms of colour-vision deficiency

---

## 12. Screen-specific UX

### 12.1 Home Dashboard

- Welcome message varies by time of day: Good morning / Good afternoon / Good evening
- Membership status card urgency, using the web app's status vocabulary:
  - `> 14 days` — `--gradient-brand-h` fill, white text (active)
  - `7–14 days` — `--color-expiring-bg` + `--color-expiring-border` + `--color-expiring-text`
  - `< 7 days` — `--color-expired-bg` + `--color-expired-border` + `--color-expired-text`
- Cards vertically stacked, no grids at `--screen-sm` and below
- Stat pills scroll horizontally with `gap: var(--gap-sm)`; apply `.no-scrollbar`
- Quick-action tiles follow the web app's dashboard pattern: 2-column grid of `rounded-xl` gradient tiles with `active:scale-95`

### 12.2 Digital Membership Card

- Full-screen card at elevation 2, `--radius-xl` (16px)
- Background `--gradient-brand` (brand-500 → brand-600, 135°) with a `--glass-brand-bg` frosted inner panel — this is the app's single most branded surface and stays vivid even though the page around it is white
- QR code: minimum 256×256px, **dark modules on a solid white tile** with `--space-6` quiet-zone padding. Do not invert; scanners expect dark-on-light and the v2.x white-on-dark spec risked read failures on cheap gym scanners
- Auto-brightness: set full brightness on card enter via the Screen Wake Lock API; restore on exit
- Member code in `--font-mono` at `--font-size-code`, white on the gradient

### 12.3 Workout Tracker

- Focused mode: reduce chrome, touch targets to 56px minimum
- Timer: `--font-size-hero` + `--font-mono` + `--color-text-primary`
- Rest timer background pulses using `--color-brand-subtle` (brand-50) on a `--duration-slower` cycle
- Swipe-to-skip: swipe left on a set row reveals a skip action over `--color-expiring-bg`
- End-workout confirmation uses an elevation 4 dialog

### 12.4 Progress Charts

- Default 30-day view; switcher 7d / 30d / 90d / all-time using `.stat-pill--active` for the selected period
- Tooltip uses `--chart-tooltip-bg` + `--chart-tooltip-border` + `--chart-tooltip-shadow`
- Empty state: placeholder illustration + CTA text in `--color-text-muted`

### 12.5 Leaderboard

- Current member row: `--color-surface-selected` (brand-50) background + 3px `--color-brand` left accent
- Positions 1–3 use `--color-leaderboard-gold` / `-silver` / `-bronze` as icon fills
- Smooth scroll to the member's position on mount; row stays sticky when scrolled out of view (`--z-sticky`)

### 12.6 Auth & Onboarding

The one dark group. Mirror the web app's login screen so a member who has seen an owner's login recognises it:

- Background `--color-auth-bg` (slate-950)
- Three blurred gradient orbs — `brand-400/20 → violet-500/10`, `cyan-400/15 → emerald-400/10`, `brand-500/10 → purple-500/10` — on slow independent `animate-pulse` cycles (8s / 6s / 10s)
- A 60px SVG grid overlay at `opacity-[0.04]`, white stroke
- Wordmark in a `brand-300 → brand-400 → cyan-400` clipped-text gradient
- Form card uses `--color-auth-surface` with `--color-auth-border`
- On leaving auth, transition to the light shell with `--transition-page`; the web app's `WelcomeTransition` component is the reference

---

## 13. Empty States

Every list and data screen defines an empty state. Illustration strokes and secondary text in `--color-text-muted`; the primary message in `--color-text-secondary`.

| Screen | Message | CTA Button |
|---|---|---|
| Workout | "Your trainer hasn't assigned a plan yet" | Ghost — "Explore plans" |
| Progress | "Log your first measurement" | Primary — "Add measurement" |
| Attendance | "Come in to start your streak!" | — |
| Notifications | "You're all caught up" | — |
| Achievements | "Complete workouts to earn badges" | Ghost — "View challenges" |

---

## 14. Error States

Toast z-index `--z-toast`; toasts animate in with `--transition-fade` + slide and auto-dismiss after 4s.

| Error type | Token | Behaviour |
|---|---|---|
| Network / offline | `--color-trial-bg` + `--color-trial-border` (cyan) | Toast: "No connection. Showing cached data." |
| Auth expired | — | Full redirect to login; no toast |
| 404 / not found | `--color-surface` card | Friendly message + ghost back button |
| Server error (5xx) | `--color-expired-bg` + `--color-expired-border` | Toast with retry button |
| Validation | `--border-error` on input + `--color-text-error` label | Inline below the field |

---

## 15. Accessibility

### Focus Rings

All interactive elements use `box-shadow: var(--focus-ring)` on `:focus-visible`. Never `outline: none` without a replacement.

```css
--focus-ring:       0 0 0 2px #FFFFFF, 0 0 0 4px var(--color-brand-400);
--focus-ring-error: 0 0 0 2px #FFFFFF, 0 0 0 4px var(--color-expired-border);

.focus-ring:focus-visible {
  outline:    none;
  box-shadow: var(--focus-ring);
}
```

The ring colour is `--color-brand-400` (`#60A5FA`), matching the web app's `focus:ring-2 focus:ring-brand-400`. Note that `#60A5FA` on white is roughly **2.5:1** — below the 3:1 UI-component threshold on its own. The offset white halo plus the 2px thickness is intended to satisfy WCAG 2.4.11 focus appearance, but **verify against a live build**; if it fails, step the ring to `--color-brand-500` (`#2563EB`, ~5.2:1) and file the same change upstream in the web app.

### Touch Targets

- Minimum 44×44px (WCAG 2.5.5) — the web app's `.tap-target` utility
- Recommended 48×48px for primary actions
- Bottom nav items minimum 48×48px

### Contrast

Recomputed for the light palette. All ratios against `--color-bg` (`#FFFFFF`).

| Role | Minimum | Tokens used |
|---|---|---|
| Body text | 4.5:1 | `--color-text-primary` (#0F172A) on white ≈ **17.9:1** ✓ |
| Secondary text | 4.5:1 | `--color-text-secondary` (#475569) on white ≈ **7.4:1** ✓ |
| Muted text | 3:1 (large only) | `--color-text-muted` (#94A3B8) on white ≈ **2.6:1** — decorative and placeholder use only |
| Links | 4.5:1 | `--color-text-link` (#2563EB) on white ≈ **5.2:1** ✓ |
| Brand text | 4.5:1 | `--color-text-brand` (#1D4ED8) on white ≈ **6.9:1** ✓ |
| Status text | 4.5:1 | All `-700` shades on their `-50` backgrounds ≥ **5.5:1** ✓ |
| White on brand | 4.5:1 | `#FFFFFF` on `#2563EB` ≈ **5.2:1** ✓ |

> `--color-text-muted` fails 4.5:1. Do not use it for body copy, form labels, or any text a member must read. Timestamps, placeholders, and inactive nav labels only — and inactive nav labels are additionally distinguished by icon state, not colour alone.

### Screen Readers

- All interactive elements have `aria-label` or `aria-labelledby`
- XP gains announced via `role="status"` live region
- Badge earns announced via `role="alert"` live region
- Progress bars: `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`

### Font Scaling

UI must remain functional at 200% browser text zoom. Use `rem` exclusively — tokens are already in `rem`. Never `px` for font sizes in component CSS.

### Haptic Feedback

```javascript
navigator.vibrate?.([30, 10, 30]);          // Streak milestone
navigator.vibrate?.([50, 20, 50, 20, 100]); // Badge earned
navigator.vibrate?.([15]);                  // Set complete
```

---

## 16. PWA Install Prompt

Show a custom install banner after 2+ visits when not yet installed. Stop after 2 dismissals. Honour the `appinstalled` event.

```css
.pwa-install-banner {
  background:    var(--color-surface);
  border:        var(--border-default);
  border-radius: var(--radius-xl);
  box-shadow:    var(--shadow-float);
  padding:       var(--space-8);
  z-index:       var(--z-modal);
}
```

```
┌────────────────────────────────────────┐
│  📱 Add GymFlow to your home screen   │
│  Access your membership anytime        │
│                                        │
│  [Install — btn-primary]  [Not Now — btn-ghost]  │
└────────────────────────────────────────┘
```

---

## 17. Naming Conventions

- **Always** `var(--token-name)` — never raw hex, raw `px` (except layout), or raw `rgba()`
- Colours: `--color-{role}` or `--color-{role}-{variant}` (e.g. `--color-active-bg`)
- Spacing: `--space-{n}` for raw values, `--padding-{component}` for semantic aliases
- Borders: `--border-{strength}` for shorthand, `--border-color-{strength}` for colour-only
- Shadows: `--shadow-{size}` or `--shadow-{semantic}`
- Animation: `--duration-{speed}`, `--ease-{curve}`, `--transition-{preset}`
- Elevation: pair `--elevation-{n}-bg` + `--elevation-{n}-border` + `--elevation-{n}-shadow`
- **Status vocabulary matches the web app:** `active` / `expiring` / `expired`. Not `warning` / `error` for membership state.

---

## 18. Migration Notes (v2.1 → v3.0)

The realignment. Every row here is a change made to match the main web app.

### 18.1 Theme & Palette

| Concern | v2.1 | v3.0 | Reason |
|---|---|---|---|
| Theme | Dark-only, OLED `#0F0F13` | **Light**, `#FFFFFF` | Web app is light; that palette was the super-admin's |
| Brand | Indigo `#6366F1` | **Blue `#2563EB`** | `tailwind.config.js` → `colors.brand.500` |
| Brand secondary | Violet `#8B5CF6` | **Cyan `#06B6D4`** | Web app's companion accent |
| Font | Inter | **Sora** | `app/layout.tsx` loads Sora as `--font-sora` |
| Surfaces 1–4 | Progressively lighter navy | All `#FFFFFF`, shadow-differentiated | Elevation on light ≠ background shifts |
| Text ramp | `#F8F8FF` → `#3D3D62` | Slate `#0F172A` → `#CBD5E1` | Web app sets `text-slate-900` on `<body>` |
| Borders | `#2E2E4A` / `#3D3D62` | Slate `#E2E8F0` / `#CBD5E1` | `colors.surface.border` |
| Overlay | `rgba(0,0,0,0.60)` | `rgba(15,23,42,0.40)` + `blur(4px)` | Web app drawer backdrop |
| Glass | Dark translucent | `rgba(255,255,255,0.80)` + `blur(12px)` | Web app `.glass` |
| Chart series | `-400` pastels | `-600` saturated | `-400` fails contrast on white |

### 18.2 Structural

| Concern | v2.1 | v3.0 | Reason |
|---|---|---|---|
| Card radius | `--radius-xl` (16px) | `--radius-lg` (**12px**) | Web app `.card` is `rounded-xl` = 12px |
| Button radius | `--radius-lg` (12px) | unchanged (12px) | Already correct |
| Tap scale | 0.95 / 0.97 | **0.98** | Web app `active:scale-[0.98]` |
| Disabled buttons | Grey bg + grey text tokens | **`opacity: 0.5`** | Web app `disabled:opacity-50` |
| Input font size | `--font-size-body` | unchanged (16px) | Kept — prevents iOS focus zoom. Documented divergence from web app's 14px |
| Shimmer duration | 1600ms | **1400ms** | Web app `shimmer 1.4s` |
| Toast position | (unspecified) | **top-center** | Web app is top-right; that clips on 375px |
| Status naming | `warning` for 7–14 days | **`expiring`** | Web app `.status-expiring` |
| Breakpoints | generic `--screen-*` | adds **`xs: 360px`**, `3xl: 1920px` | Web app `screens` extension |
| Focus ring | `#818CF8` | **`#60A5FA`** (`brand-400`) | Web app `focus:ring-brand-400` — with a contrast caveat, see §15 |
| Gamification glows | Neon `box-shadow` | Tinted `bg`+`border` triads | Neon reads as blur on white |
| QR code | White modules on dark | **Dark modules on white** | Scanner reliability |
| Keyframes | Bespoke set | **Reuse web app's 8 keyframes** | One shimmer, one pop-in, one slide-up |

### 18.3 Token Shorthand (carried over from v2.0 → v2.1, still valid)

| Old | New |
|---|---|
| `1px solid var(--color-border)` | `var(--border-default)` |
| `backdrop-filter: blur(12px)` | `backdrop-filter: var(--glass-blur)` |
| `border-radius: 12px` | `var(--radius-lg)` |
| `border-radius: 16px` | `var(--radius-xl)` |
| `border-radius: 99px` | `var(--radius-full)` |
| `0.6s cubic-bezier(0.34, 1.56, 0.64, 1)` | `var(--duration-slow) var(--ease-bounce)` |
| Raw `z-index: 100` | `var(--z-dropdown)` |

### 18.4 Action Items for Implementers

1. Regenerate `design-tokens.css` from Sections 2–7 of this document.
2. Extend the PWA's `tailwind.config.js` with the **same** `brand`, `cyan`, `surface`, `screens`, and `fontFamily` blocks as the web app's, so utility classes are interchangeable between the two codebases.
3. Copy the `@layer components` block from the web app's `globals.css` (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input-field`, `.card`, `.status-*`, `.skeleton`, `.no-scrollbar`, `.tap-target`, `.pb-safe-bottom`, `.pt-safe-top`) as the PWA's starting point, then layer PWA-only additions on top.
4. Update `manifest.json`: `theme_color` → `#2563EB`, `background_color` → `#FFFFFF`.
5. Update the DB default for `gyms.brand_color` from `#6366F1` to `#2563EB` (see `03_Database_Schema.md`).
6. Re-audit every screen mockup produced against v2.x — they were composed on dark and will need contrast rework, not just a background swap.


---

## 19. Normative Implementation Tokens (v3.1)

This section completes values referenced earlier in this document. These definitions are normative for `design-tokens.css`; component code must not invent alternatives. Font sizes and layout dimensions use `rem` so browser zoom remains functional. Borders and shadows may use physical pixels where sub-rem values are required.

```css
:root {
  /* Typography */
  --font-size-micro: 0.625rem;
  --font-size-caption: 0.75rem;
  --font-size-body-sm: 0.875rem;
  --font-size-label: 0.875rem;
  --font-size-button: 0.875rem;
  --font-size-code: 0.875rem;
  --font-size-body: 1rem;
  --font-size-h4: 1.125rem;
  --font-size-h3: 1.25rem;
  --font-size-h2: 1.5rem;
  --font-size-h1: 1.875rem;
  --font-size-stat: 1.875rem;
  --font-size-display: 2.25rem;
  --font-size-hero: 3rem;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --leading-none: 1;
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  /* Intermediate spacing values used by components */
  --space-3: 0.375rem;
  --space-5: 0.625rem;
  --space-7: 0.875rem;
  --gap-sm: var(--space-4);
  --badge-padding-x: var(--space-4);
  --badge-padding-y: var(--space-2);
  --bottom-nav-height: 4rem;

  /* Gradients */
  --gradient-button: linear-gradient(to right, var(--color-brand-500), var(--color-brand-600));
  --gradient-button-hover: linear-gradient(to right, var(--color-brand-600), var(--color-brand-700));
  --gradient-brand: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600));
  --gradient-brand-h: linear-gradient(to right, var(--color-brand-500), var(--color-brand-600));
  --gradient-xp: linear-gradient(to right, #F59E0B, #D97706);
  --gradient-streak: linear-gradient(to right, #F97316, #EA580C);
  --gradient-error: linear-gradient(to right, #EF4444, #DC2626);

  /* Generic warning aliases */
  --color-warning-bg: var(--color-expiring-bg);
  --color-warning-border: var(--color-expiring-border);
  --color-warning-text: var(--color-expiring-text);

  /* Motion */
  --duration-instant: 1ms;
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-dialog: 250ms;
  --duration-drawer: 300ms;
  --duration-page: 350ms;
  --duration-slow: 400ms;
  --duration-slower: 500ms;
  --duration-shimmer: 1400ms;
  --ease-linear: linear;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
  --ease-decelerate: cubic-bezier(0, 0, 0, 1);
  --ease-accelerate: cubic-bezier(0.3, 0, 1, 1);
  --ease-snap: cubic-bezier(0.2, 0, 0, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --transition-hover: color var(--duration-normal) var(--ease-standard), background-color var(--duration-normal) var(--ease-standard), border-color var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard);
  --transition-color: color var(--duration-normal) var(--ease-standard), background-color var(--duration-normal) var(--ease-standard), border-color var(--duration-normal) var(--ease-standard);
  --transition-press: transform var(--duration-fast) var(--ease-snap);
  --transition-card: border-color var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard), transform var(--duration-fast) var(--ease-snap);
  --transition-dialog: opacity var(--duration-dialog) var(--ease-decelerate), transform var(--duration-dialog) var(--ease-decelerate);
  --transition-drawer: transform var(--duration-drawer) var(--ease-emphasized);
  --transition-fade: opacity var(--duration-normal) var(--ease-standard);
  --transition-page: opacity var(--duration-page) var(--ease-decelerate), transform var(--duration-page) var(--ease-decelerate);

  /* Elevation aliases */
  --elevation-0-bg: var(--color-bg);
  --elevation-0-border: none;
  --elevation-0-shadow: none;
  --elevation-1-bg: var(--color-surface);
  --elevation-1-border: var(--border-default);
  --elevation-1-shadow: var(--shadow-sm);
  --elevation-2-bg: var(--color-surface-2);
  --elevation-2-border: var(--border-default);
  --elevation-2-shadow: var(--shadow-md);
  --elevation-3-bg: var(--color-surface-3);
  --elevation-3-border: var(--border-subtle);
  --elevation-3-shadow: var(--shadow-lg);
  --elevation-4-bg: var(--color-surface-4);
  --elevation-4-border: none;
  --elevation-4-shadow: var(--shadow-float);

  /* Colour-vision-safe chart series; pair colour with shape/label */
  --chart-series-1: #2563EB;
  --chart-series-2: #D97706;
  --chart-series-3: #059669;
  --chart-series-4: #C026D3;
  --chart-series-5: #DC2626;
  --chart-series-6: #0891B2;
  --chart-series-7: #7C3AED;
  --chart-series-8: #334155;

  /* brand-500 is used for the PWA ring because it clears 3:1 on white. */
  --focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 4px var(--color-brand-500);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

The PWA intentionally uses `brand-500` for its focus ring instead of inheriting the web app's lower-contrast `brand-400`; this is an accessibility correction that should also be applied upstream.