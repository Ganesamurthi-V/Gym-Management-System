# GymFlow Member PWA — UI/UX Guidelines

**Version:** 2.1
**Design tokens file:** `design-tokens.css`

> This document is the single source of truth for visual design decisions in the GymFlow Member PWA. All token names reference `design-tokens.css` v2.0. Never hardcode colours, spacing, radii, shadows, or durations — consume tokens exclusively.

---

## 1. Design Philosophy

The GymFlow Member PWA should feel like a premium native fitness app — fast, tactile, and motivating. Every interaction must give immediate feedback. Every screen must communicate progress and energy without being overwhelming.

**Core principles:**
- **Mobile-first, always** — design for 375px wide, scale up using `--screen-*` breakpoints
- **Motion communicates state** — use `--transition-*` and `--duration-*` tokens purposefully, never decoratively
- **Gamification is visual** — XP, streaks, and badges must feel rewarding using glow tokens (`--shadow-xp`, `--shadow-streak`, `--shadow-badge`)
- **Offline is a first-class experience** — degraded state should still feel premium using skeleton tokens
- **Gym branding is respected** — `--color-brand` and `--color-brand-2` are dynamically overridden at runtime
- **Elevation tells the story** — every surface layer uses the elevation system, never flat stacking of arbitrary colours
- **Dark-first always** — target OLED-optimised blacks, avoid harsh whites; follow the Linear/Raycast aesthetic

---

## 2. Colour System

### 2.1 Brand Palette

All colours live in `design-tokens.css`. Never write raw hex in components.

```css
/* Brand — dynamically overridden at runtime */
--color-brand:        #6366F1;
--color-brand-light:  #818CF8;
--color-brand-dark:   #4F46E5;
--color-brand-2:      #8B5CF6;

/* Brand-tinted surfaces (use these for subtle highlights) */
--color-brand-subtle:   rgba(99, 102, 241, 0.08);
--color-brand-muted:    rgba(99, 102, 241, 0.16);
--color-brand-emphasis: rgba(99, 102, 241, 0.32);
```

### 2.2 Surface Hierarchy

Use surfaces in order — never skip elevation levels.

| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#0F0F13` | Page background (Elevation 0) |
| `--color-surface` | `#1A1A24` | Base cards (Elevation 1) |
| `--color-surface-2` | `#24243A` | Elevated cards, dropdowns (Elevation 2) |
| `--color-surface-3` | `#2C2C46` | Modals, popovers (Elevation 3) |
| `--color-surface-4` | `#353554` | Tooltips, dialogs (Elevation 4) |
| `--color-surface-hover` | `#1F1F30` | Hover state over base surface |
| `--color-surface-pressed` | `#161622` | Active/pressed state |
| `--color-surface-selected` | `#22224E` | Selected row or item |

Overlay / scrim:
```css
--color-overlay:       rgba(0, 0, 0, 0.60);  /* Modals, drawers */
--color-overlay-light: rgba(0, 0, 0, 0.32);  /* Lighter overlays */
```

### 2.3 Gym Branding Override

On app load, fetch `gyms.brand_color` and apply. Only override the four brand tokens — never touch neutrals or semantic tokens.

```javascript
function applyGymBranding(gym) {
  const root = document.documentElement;
  root.style.setProperty('--color-brand',       gym.brand_color);
  root.style.setProperty('--color-brand-2',     gym.brand_color_2 ?? '#8B5CF6');

  // Derive light/dark variants programmatically if not provided
  // Use a colour library (tinycolor2) to lighten/darken brand_color by 15%
  root.style.setProperty('--color-brand-light', lighten(gym.brand_color, 15));
  root.style.setProperty('--color-brand-dark',  darken(gym.brand_color, 10));
}
```

### 2.4 Text Colours

```css
--color-text-primary:    #F8F8FF;   /* Headings, active labels */
--color-text-secondary:  #94A3B8;   /* Body copy, descriptions */
--color-text-muted:      #64748B;   /* Placeholders, timestamps */
--color-text-disabled:   #3D3D62;   /* Disabled labels */
--color-text-link:       #818CF8;   /* Inline links */
--color-text-brand:      #818CF8;   /* Brand-coloured text */
```

Semantic text:
```css
--color-text-success:  #4ADE80;
--color-text-warning:  #FCD34D;
--color-text-error:    #F87171;
--color-text-info:     #7DD3FC;
```

### 2.5 Status Colours

Every status has a `bg / border / text` triad. Always use all three together for badges and chips.

| Status | Base | Usage |
|---|---|---|
| Active | `--color-active` | Active membership, live session |
| Expired | `--color-expired` | Expired plan |
| Pending | `--color-pending` | Awaiting action |
| Paused | `--color-paused` | Paused membership |
| Renewed | `--color-renewed` | Recently renewed |
| Trial | `--color-trial` | Trial period |
| Premium | `--color-premium` | Premium plan |
| VIP | `--color-vip` | VIP member |
| Verified | `--color-verified` | Identity verified |
| Locked | `--color-locked` | Locked feature/account |
| New | `--color-new` | New member badge |
| Inactive | `--color-inactive` | Inactive account |

Example usage:
```css
.badge-active {
  background:   var(--color-active-bg);
  border:       1px solid var(--color-active-border);
  color:        var(--color-active-text);
}
```

### 2.6 Gamification Colours

```css
--color-xp:              #FBBF24;  /* Gold — XP points */
--color-streak:          #F97316;  /* Orange fire — streak counter */
--color-badge:           #A78BFA;  /* Purple glow — badge earned */
--color-level:           #60A5FA;  /* Blue — level indicator */
--color-achievement:     #F472B6;  /* Pink — achievement unlock */
--color-challenge:       #34D399;  /* Teal — active challenge */
--color-reward:          #FDE68A;  /* Warm amber — reward */
--color-leaderboard-gold:   #FBBF24;
--color-leaderboard-silver: #94A3B8;
--color-leaderboard-bronze: #C2836A;
--color-victory:         #FBBF24;
```

### 2.7 Dark Mode

The PWA is **dark-mode only**. No light theme is required. Background targets OLED blacks (`--color-bg: #0F0F13`). Avoid surfaces lighter than `--color-surface-4` for any non-interactive element.

---

## 3. Typography

Font tokens from `design-tokens.css`:

```css
--font-display:  'Inter', 'SF Pro Display', system-ui, sans-serif;
--font-heading:  'Inter', 'SF Pro Text', system-ui, sans-serif;
--font-body:     'Inter', 'SF Pro Text', system-ui, sans-serif;
--font-mono:     'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
```

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
| Label | `--font-size-label` | 14px | `--weight-semibold` (600) | `--leading-tight` (1.25) |
| Button | `--font-size-button` | 14px | `--weight-semibold` (600) | `--leading-none` (1) |
| Stat | `--font-size-stat` | 30px | `--weight-bold` (700) | `--leading-tight` (1.25) |
| Code / member ID | `--font-size-code` | 14px | `--weight-regular` (400) | `--leading-normal` (1.5) |

> **Display numbers** (XP totals, step counts, weight): use `--font-size-hero` + `--weight-bold` + `--tracking-tight`. These are the most motivating elements — make them feel substantial.

### 3.2 Letter Spacing

```css
--tracking-tight:   -0.025em;  /* Display headings, hero stats */
--tracking-normal:   0em;      /* Body copy */
--tracking-wide:     0.025em;  /* Uppercase labels, overlines */
--tracking-widest:   0.1em;    /* Micro labels (e.g. "STREAK") */
```

### 3.3 Mono Usage

Use `--font-mono` exclusively for: member codes, QR labels, biometric codes, timer displays.

---

## 4. Spacing System

All spacing uses `--space-*` tokens from `design-tokens.css`. The base unit is 8px.

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

**Page horizontal padding:**

```css
.page-container {
  padding-inline: var(--space-8);     /* 16px mobile */
}
@media (min-width: 640px) {
  .page-container {
    padding-inline: var(--space-12);  /* 24px tablet+ */
  }
}
```

**Named aliases for common patterns:**
```css
--padding-card:      var(--space-8);   /* 16px */
--padding-modal:     var(--space-10);  /* 20px */
--padding-button-x:  var(--space-12);  /* 24px */
--padding-button-y:  var(--space-6);   /* 12px */
--padding-input-x:   var(--space-10);  /* 20px */
--padding-input-y:   var(--space-6);   /* 12px */
--padding-section:   var(--space-12);  /* 24px */
```

---

## 5. Component Library

### 5.1 Cards

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
  background:    var(--card-bg);           /* --color-surface */
  border:        var(--card-border);       /* --border-default */
  border-radius: var(--radius-xl);         /* 16px */
  box-shadow:    var(--card-shadow);       /* --shadow-sm */
  padding:       var(--padding-card);
  transition:    var(--transition-card);
}
.card:hover {
  border-color:  var(--border-color-strong);
  box-shadow:    var(--shadow-float);
}
```

**Variants:**

| Class | Background | Border | Shadow | Use |
|---|---|---|---|---|
| `card-default` | `--color-surface` | `--border-default` | `--shadow-sm` | Standard info card |
| `card-elevated` | `--color-surface-2` | `--border-strong` | `--shadow-md` | Floating content card |
| `card-brand` | `--gradient-brand` | `--border-brand` | `--shadow-brand` | Membership status, CTAs |
| `card-glass` | `--glass-bg` | `--glass-border` | `--glass-shadow` | Hero overlays; use `backdrop-filter: var(--glass-blur)` |
| `card-highlight` | `--color-surface` | `--border-default` | `--shadow-sm` | Left border accent: `border-left: 3px solid var(--color-brand)` |
| `card-xp` | `--color-xp-bg` | `--color-xp-border` | `--shadow-xp` | XP / gamification moments |
| `card-streak` | `--color-streak-bg` | `--color-streak-border` | `--shadow-streak` | Streak milestones |

### 5.2 Buttons

All button heights are 48px minimum to satisfy the 44×44px touch target requirement.

```css
/* Primary */
.btn-primary {
  height:          48px;
  padding:         0 var(--padding-button-x);
  background:      var(--btn-primary-gradient);  /* --gradient-button */
  color:           var(--btn-primary-text);       /* #FFFFFF */
  border-radius:   var(--radius-lg);              /* 12px */
  font-size:       var(--font-size-button);       /* 14px */
  font-weight:     var(--weight-semibold);        /* 600 */
  box-shadow:      var(--shadow-brand);
  transition:      var(--transition-hover);
}
.btn-primary:hover   { background: var(--gradient-button-hover); }
.btn-primary:active  { transform: scale(0.97); transition: var(--transition-press); }
.btn-primary:focus-visible { box-shadow: var(--focus-ring); }
.btn-primary:disabled {
  background:  var(--color-disabled-bg);
  color:       var(--color-disabled-text);
  box-shadow:  none;
  cursor:      not-allowed;
}

/* Secondary */
.btn-secondary {
  background:    var(--btn-secondary-bg);       /* --color-surface-2 */
  color:         var(--btn-secondary-text);     /* --color-text-primary */
  border:        var(--btn-secondary-border);   /* --border-default */
  border-radius: var(--radius-lg);
}
.btn-secondary:hover { background: var(--btn-secondary-bg-hover); }

/* Ghost */
.btn-ghost {
  background:  transparent;
  color:       var(--color-text-brand);
  border:      none;
}
.btn-ghost:hover { background: var(--state-hover-bg); color: var(--color-text-primary); }

/* Danger */
.btn-danger {
  background:    var(--color-error-bg);
  color:         var(--color-error-text);
  border:        var(--border-error);
  border-radius: var(--radius-lg);
}
.btn-danger:hover { background: var(--color-error-bg-hover); }
```

**States:**

| State | Visual |
|---|---|
| Default | Base styles above |
| Hover | Lighter gradient / bg shift via token |
| Pressed | `transform: scale(0.95)` using `--transition-press` |
| Focused | `box-shadow: var(--focus-ring)` |
| Disabled | `--color-disabled-bg` + `--color-disabled-text`, `opacity: var(--state-disabled-opacity)` |
| Loading | Replace label with spinner; add `aria-busy="true"`; disable pointer events |
| Success | Brief checkmark animation (`--duration-slow`) then reset |

### 5.3 Bottom Navigation

```
┌────────────────────────────────────────────┐
│  Home   Workout  Progress  Rewards  Profile │
│   ●                                        │ ← active tab indicator
└────────────────────────────────────────────┘
  ↑ height: var(--bottom-nav-height) + var(--pwa-safe-bottom)
```

```css
.bottom-nav {
  height:           calc(var(--bottom-nav-height) + var(--pwa-safe-bottom));
  background:       var(--glass-bg);
  backdrop-filter:  var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-top:       1px solid var(--glass-border);
  z-index:          var(--z-sticky);
}
.bottom-nav__item--active {
  color: var(--color-brand);
}
.bottom-nav__item {
  color: var(--color-text-muted);
  transition: var(--transition-color);
  min-width: 44px;
  min-height: 44px;
}
.bottom-nav__badge {
  background:    var(--color-error);
  border-radius: var(--radius-full);
  min-width:     8px;
  height:        8px;
}
```

### 5.4 Progress Bars

```css
.progress-bar {
  height:        8px;
  background:    var(--color-border);
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

Membership urgency — override fill colour based on days remaining:

```css
.progress-fill--urgent   { background: var(--gradient-error); }    /* < 7 days  */
.progress-fill--warning  { background: var(--gradient-streak); }   /* 7–14 days */
.progress-fill--healthy  { background: var(--gradient-brand-h); }  /* > 14 days */
```

### 5.5 XP Bar

Displays current XP progress within the current level. Uses gamification gradient.

```
Level 5  ████████████░░░░  2,340 / 3,000 XP  → Level 6
         [--gradient-xp: gold → amber]
```

```css
.xp-bar-fill {
  background:   var(--gradient-xp);
  box-shadow:   var(--shadow-xp);
  transition:   width var(--duration-slow) var(--ease-bounce);
}
.xp-label {
  color:        var(--color-xp-text);
  font-size:    var(--font-size-caption);
  font-weight:  var(--weight-semibold);
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
  background:    var(--color-streak-bg);
  border:        1px solid var(--color-streak-border);
  border-radius: var(--radius-lg);
  box-shadow:    var(--shadow-streak);
  color:         var(--color-streak-text);
}
.streak-count {
  font-size:     var(--font-size-stat);
  font-weight:   var(--weight-bold);
  color:         var(--color-streak);
}
```

Animate the flame with a gentle pulse when `streak > 0`. Use CSS animation, not JS:

```css
@keyframes streak-pulse {
  0%, 100% { transform: scale(1);    filter: brightness(1); }
  50%       { transform: scale(1.12); filter: brightness(1.2); }
}
.streak-icon--active {
  animation: streak-pulse 2s var(--ease-standard) infinite;
}
```

### 5.7 Stats Pills

Horizontally scrollable, touch-scroll on mobile (`overflow-x: auto; -webkit-overflow-scrolling: touch`).

```css
.stat-pill {
  background:    var(--color-surface-2);
  border:        var(--border-subtle);
  border-radius: var(--radius-full);
  padding:       var(--space-3) var(--space-6);
  font-size:     var(--font-size-body-sm);
  font-weight:   var(--weight-medium);
  color:         var(--color-text-secondary);
  white-space:   nowrap;
  flex-shrink:   0;
}
```

### 5.8 Input Fields

```css
.input {
  background:    var(--input-bg);
  border:        var(--input-border);
  border-radius: var(--radius-input);
  padding:       var(--padding-input-y) var(--padding-input-x);
  font-size:     var(--font-size-body);
  color:         var(--input-text);
  height:        48px;
  transition:    var(--transition-hover);
}
.input::placeholder { color: var(--input-placeholder); }
.input:hover        { border-color: var(--border-color-strong); }
.input:focus        {
  outline:       none;
  background:    var(--input-bg-focus);
  border:        var(--input-border-focus);
  box-shadow:    var(--focus-ring);
}
.input--error       { border: var(--border-error); box-shadow: var(--focus-ring-error); }
```

### 5.9 Badges / Status Chips

```css
.badge {
  display:        inline-flex;
  align-items:    center;
  gap:            var(--space-2);
  padding:        var(--badge-padding-y) var(--badge-padding-x);
  border-radius:  var(--radius-badge);
  font-size:      var(--badge-font-size);
  font-weight:    var(--badge-font-weight);
  line-height:    var(--leading-none);
}

/* Status variants — always use the triad */
.badge--active   { background: var(--color-active-bg);   border: 1px solid var(--color-active-border);   color: var(--color-active-text);   }
.badge--expired  { background: var(--color-expired-bg);  border: 1px solid var(--color-expired-border);  color: var(--color-expired-text);  }
.badge--trial    { background: var(--color-trial-bg);    border: 1px solid var(--color-trial-border);    color: var(--color-trial-text);    }
.badge--premium  { background: var(--color-premium-bg);  border: 1px solid var(--color-premium-border);  color: var(--color-premium-text);  }
.badge--vip      { background: var(--color-vip-bg);      border: 1px solid var(--color-vip-border);      color: var(--color-vip-text);      }
.badge--pending  { background: var(--color-pending-bg);  border: 1px solid var(--color-pending-border);  color: var(--color-pending-text);  }
```

### 5.10 Skeleton Loaders

Use the `.skeleton` utility class from `design-tokens.css`. It applies the shimmer animation automatically.

```html
<!-- Card skeleton -->
<div class="card">
  <div class="skeleton" style="height: 20px; width: 60%; margin-bottom: var(--space-4);"></div>
  <div class="skeleton" style="height: 14px; width: 40%;"></div>
</div>
```

Do not use opacity flicker or grey block placeholders. The shimmer (`--skeleton-shimmer`) must be the only loading visual.

### 5.11 Toast Notifications

```css
.toast {
  background:    var(--color-surface-3);
  border:        var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow:    var(--shadow-float);
  padding:       var(--space-6) var(--space-8);
  z-index:       var(--z-toast);
  font-size:     var(--font-size-body-sm);
}
.toast--error   { border-left: 3px solid var(--color-error);   }
.toast--success { border-left: 3px solid var(--color-success); }
.toast--warning { border-left: 3px solid var(--color-warning); }
.toast--info    { border-left: 3px solid var(--color-info);    }
```

---

## 6. Elevation System

Never mix elevation levels arbitrarily. Each level has a fixed background, border, and shadow from the token system.

| Level | Token set | Use |
|---|---|---|
| 0 | `--elevation-0-*` | Page background, no visual surface |
| 1 | `--elevation-1-*` | Base cards, list items, inputs |
| 2 | `--elevation-2-*` | Floating cards, dropdowns, date pickers |
| 3 | `--elevation-3-*` | Modals, bottom sheets, side drawers |
| 4 | `--elevation-4-*` | Dialogs, confirmation overlays, tooltips |

```css
/* Elevation 1 — standard card */
.card {
  background: var(--elevation-1-bg);
  border:     var(--elevation-1-border);
  box-shadow: var(--elevation-1-shadow);
}

/* Elevation 3 — bottom sheet */
.bottom-sheet {
  background: var(--elevation-3-bg);
  border:     var(--elevation-3-border);
  box-shadow: var(--elevation-3-shadow);
}
```

---

## 7. Border System

Replace raw border values with tokens:

```css
--border-subtle:        1px solid rgba(255, 255, 255, 0.04);  /* hairline dividers */
--border-default:       1px solid #2E2E4A;                     /* standard card border */
--border-strong:        1px solid #3D3D62;                     /* hover, focused card */
--border-stronger:      1px solid #4E4E78;                     /* modal, high-elevation */
--border-brand:         1px solid rgba(99, 102, 241, 0.50);    /* brand accent borders */
--border-focus:         2px solid #6366F1;                     /* keyboard focus ring */
```

**Rules:**
- Dividers between list items: `--border-subtle`
- All card defaults: `--border-default`
- Card on hover/focus: `--border-strong`
- Modal containers: `--border-stronger`
- Brand-accented highlights: `--border-brand`
- Focus rings always use `--focus-ring` (box-shadow), not `outline`

---

## 8. Navigation

### 8.1 Bottom Navigation (primary)

5 tabs: Home, Workout, Progress, Rewards, Profile. No header on mobile.

Z-index: `var(--z-sticky)`. Height: `calc(var(--bottom-nav-height) + var(--pwa-safe-bottom))`. Safe area inset is `env(safe-area-inset-bottom, 0px)` and already aliased as `--pwa-safe-bottom`.

### 8.2 Back Navigation

Browser/OS back gesture is primary. Provide a `←` back button in secondary views using ghost button style (`--btn-ghost-*` tokens). Touch target minimum 44×44px.

### 8.3 Bottom Sheets (Modal Sheets)

Use instead of full-screen modals for secondary actions.

```css
.sheet {
  background:    var(--elevation-3-bg);
  border:        var(--elevation-3-border);
  border-radius: var(--radius-3xl) var(--radius-3xl) 0 0;  /* 24px top corners only */
  box-shadow:    var(--elevation-3-shadow);
  z-index:       var(--z-modal);
}
.sheet-overlay {
  background: var(--color-overlay);
  z-index:    var(--z-overlay);
}
```

Sheet heights:
- Short: 40vh — quick confirmations, single-action
- Medium: 65vh — forms, filters, selection lists
- Tall: 90vh — complex flows, multi-step

Slide-up animation: `transform var(--duration-drawer) var(--ease-emphasized)`.

### 8.4 Z-Index Stack

Always use tokens — never raw z-index numbers in components:

```css
--z-dropdown: 100;   /* Gym branding picker, selects */
--z-sticky:   200;   /* Bottom nav, sticky headers */
--z-overlay:  300;   /* Sheet backdrop / scrim */
--z-modal:    400;   /* Bottom sheets, modals */
--z-popover:  500;   /* Tooltips, context menus */
--z-toast:    700;   /* Toast notifications */
```

---

## 9. Motion & Animation

All animations use duration and easing tokens. All animations respect `prefers-reduced-motion` via the global rule in `design-tokens.css`.

### 9.1 Transition Presets

Use named presets, not raw `transition` values:

```css
--transition-hover   /* Color, bg, border, shadow changes */
--transition-press   /* Scale on tap/click */
--transition-card    /* Card hover elevation shift */
--transition-dialog  /* Modal/sheet open/close */
--transition-drawer  /* Drawer slide */
--transition-fade    /* Opacity fade in/out */
--transition-page    /* Route-level page transition */
```

### 9.2 Animation Reference Table

| Interaction | Behaviour | Duration Token | Easing Token |
|---|---|---|---|
| Page transition | Slide up + fade in | `--duration-page` (350ms) | `--ease-decelerate` |
| Card tap | Scale to 0.97 | `--duration-fast` (100ms) | `--ease-snap` |
| Button tap | Scale to 0.95 | `--duration-fast` (100ms) | `--ease-snap` |
| Bottom sheet open | Slide up from bottom | `--duration-drawer` (300ms) | `--ease-emphasized` |
| Dialog open | Fade + scale from 0.95 | `--duration-dialog` (250ms) | `--ease-decelerate` |
| XP gain | Counter increment + glow | `--duration-slower` (500ms) | `--ease-standard` |
| Badge earn | Scale in + confetti burst | 1000ms | `--ease-bounce` |
| Streak milestone | Shake + pulse | `--duration-slow` (400ms) | `--ease-bounce` |
| Set complete | Checkmark draw | `--duration-slow` (400ms) | `--ease-standard` |
| Progress bar fill | Width expand | `--duration-slow` (400ms) | `--ease-bounce` |
| Skeleton shimmer | Continuous sweep | `--duration-shimmer` (1600ms) | `--ease-linear` |
| Toast enter | Slide up + fade | `--duration-normal` (200ms) | `--ease-decelerate` |
| Toast exit | Slide down + fade | `--duration-fast` (100ms) | `--ease-accelerate` |

### 9.3 Micro-interactions

- **Workout set complete:** Checkbox draws a green checkmark using SVG stroke animation. Row background shifts briefly to `--color-success-bg`. Use `--duration-slow` + `--ease-standard`.
- **XP earned:** Floating `+50 XP` text uses `--color-xp-text` and `--font-size-body-sm`. Rises 24px and fades. `--duration-slower` + `--ease-accelerate`.
- **Badge earned:** Full-screen overlay (`--color-overlay`). Badge scales from 0.5 to 1.0 (`--ease-bounce`). Confetti uses `--color-confetti-1` through `--color-confetti-6`.
- **Streak milestone:** Flame icon pulses using `@keyframes streak-pulse` (defined in Section 5.6). Brief `navigator.vibrate([30, 10, 30])` haptic.
- **XP bar fill on level-up:** Bar first completes to 100% (`--gradient-xp` glow via `--shadow-xp`), then resets to 0 and refills to new level progress.

### 9.4 Motion Rules

1. **Never animate for decoration** — every animation must communicate state change
2. **Maximum total screen animation:** no more than 3 concurrent animations
3. **Hover behaviour:** use `--transition-hover` on all interactive elements
4. **Page transitions:** use `--transition-page`; avoid abrupt cuts
5. **Loading states:** skeleton shimmer only; no spinners except inside buttons
6. **Reduced motion:** `@media (prefers-reduced-motion: reduce)` collapses all durations to `0.01ms`. This is handled globally in `design-tokens.css` — no per-component overrides needed.

---

## 10. Glassmorphism

Use sparingly — only over visual content (hero photos, gradient backgrounds). Never on flat-colour surfaces.

```css
/* Use .glass utility class from design-tokens.css */
.card-glass {
  background:          var(--glass-bg);
  backdrop-filter:     var(--glass-blur);       /* blur(16px) */
  -webkit-backdrop-filter: var(--glass-blur);
  border:              1px solid var(--glass-border);
  box-shadow:          var(--glass-shadow);
}

/* Brand-tinted glass (membership card hero) */
.card-glass--brand {
  background:  var(--glass-brand-bg);
  border-color:var(--glass-brand-border);
}
```

**Rules:**
- Never use `blur` values larger than `--glass-blur-lg` (24px)
- Always pair with a semi-opaque background — pure `transparent` with blur performs poorly on low-end Android
- Test on real device, not desktop browser — blur behaviour differs significantly

---

## 11. Charts & Data Visualisation

Use dedicated chart tokens — never reuse semantic or brand colours for data series.

```css
--chart-weight:      #60A5FA;   /* Weight over time */
--chart-attendance:  #34D399;   /* Attendance frequency */
--chart-revenue:     #A78BFA;   /* (admin-facing) Revenue */
--chart-workout:     #F97316;   /* Workout completion % */
--chart-calories:    #F472B6;   /* Calorie intake */
--chart-bmi:         #FBBF24;   /* BMI tracking */
--chart-measurements:#38BDF8;   /* Body measurements */
```

Chart infrastructure tokens:
```css
--chart-grid:           rgba(255, 255, 255, 0.05);  /* Grid lines */
--chart-axis:           #3D3D62;                     /* Axis lines */
--chart-label:          #64748B;                     /* Axis labels */
--chart-tooltip-bg:     #1F1F30;                     /* Tooltip background */
--chart-tooltip-border: #2E2E4A;                     /* Tooltip border */
```

**Recharts customisation:**
```jsx
<CartesianGrid stroke="var(--chart-grid)" />
<XAxis tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
<Tooltip
  contentStyle={{
    background:   'var(--chart-tooltip-bg)',
    border:       '1px solid var(--chart-tooltip-border)',
    borderRadius: 'var(--radius-md)',
  }}
/>
```

**Colour-blind rules:**
- Never use red + green as the only distinguishing factor between two series
- Always pair colour with a secondary visual cue (line style, shape marker, or label)
- The 8-series palette (`--chart-series-1` → `--chart-series-8`) is Okabe-Ito-inspired and safe for the three major forms of colour-vision deficiency

---

## 12. Screen-specific UX

### 12.1 Home Dashboard

- Welcome message varies by time of day: Good morning / Good afternoon / Good evening
- Membership status card urgency via token-based fill:
  - `> 14 days`: `--gradient-brand-h` (default)
  - `7–14 days`: `--color-warning` fill + `--color-warning-border`
  - `< 7 days`: `--gradient-error` fill + `--color-error-border` + `--shadow-error`
- Cards are vertically stacked, no grids on mobile (`--screen-sm` and below)
- Stat pills scroll horizontally with `gap: var(--gap-sm)`, no scrollbar visible

### 12.2 Digital Membership Card

- Full-screen card, elevation 2 (`--elevation-2-*`)
- Card uses `--gradient-brand` as background with `--glass-bg` for frosted inner
- QR code: minimum 200×200px, white fill on dark background
- Auto-brightness: set `screen.brightness = 1.0` via Screen Wake Lock API on card enter; restore on exit
- `--font-mono` for member code display, `--font-size-code` size

### 12.3 Workout Tracker

- Focused mode: reduce chrome, increase touch target size to 56px minimum
- Timer: `--font-size-hero` + `--font-mono` + `--color-text-primary`
- Rest timer background pulses using `--color-brand-subtle` with slow `--duration-slower` cycle
- Swipe-to-skip: swipe left on a set row reveals skip action (`--color-warning-bg` revealed layer)
- End workout confirmation uses elevation 4 dialog (`--elevation-4-*`)

### 12.4 Progress Charts

- Default to 30-day view; period switcher: 7d / 30d / 90d / all-time
- Chart tooltip uses `--chart-tooltip-bg` + `--chart-tooltip-border`
- Empty state: placeholder illustration + CTA text in `--color-text-muted`

### 12.5 Leaderboard

- Current member: `--color-surface-selected` row background + `--border-brand` left accent
- Position 1–3 icons use `--color-leaderboard-gold`, `--color-leaderboard-silver`, `--color-leaderboard-bronze`
- Smooth scroll to member position on mount; member remains sticky if scrolled out of view (`--z-sticky`)

---

## 13. Empty States

Every list and data screen must define an empty state. Use `--color-text-muted` for illustration strokes and secondary text; `--color-text-secondary` for the primary message.

| Screen | Message | CTA Button |
|---|---|---|
| Workout | "Your trainer hasn't assigned a plan yet" | Ghost button — "Explore plans" |
| Progress | "Log your first measurement" | Primary button — "Add measurement" |
| Attendance | "Come in to start your streak!" | — |
| Notifications | "You're all caught up" | — |
| Achievements | "Complete workouts to earn badges" | Ghost button — "View challenges" |

---

## 14. Error States

Toast z-index: `--z-toast`. All toasts animate in using `--transition-fade` + slide; auto-dismiss after 4s.

| Error type | Token | Behaviour |
|---|---|---|
| Network / offline | `--color-info-bg` + `--color-info-border` | Toast: "No connection. Showing cached data." |
| Auth expired | — | Full redirect to login; no toast |
| 404 / not found | `--color-surface` card | Friendly message + ghost back button |
| Server error (5xx) | `--color-error-bg` + `--color-error-border` | Toast with retry button |
| Validation | `--border-error` on input + `--color-error-text` label | Inline below the field |

---

## 15. Accessibility

### Focus Rings

All interactive elements use `box-shadow: var(--focus-ring)` on `:focus-visible`. Never use `outline: none` without replacing it.

```css
/* Applied globally via design-tokens.css utility class */
.focus-ring:focus-visible {
  outline:    none;
  box-shadow: var(--focus-ring);
  /* = 0 0 0 2px --color-bg, 0 0 0 4px --focus-ring-color (#818CF8) */
  /* Contrast: #818CF8 on #0F0F13 = 5.3:1 — passes WCAG AA */
}
```

### Touch Targets

- Minimum: 44×44px (WCAG 2.5.5)
- Recommended: 48×48px for primary actions
- Bottom nav items: minimum 48×48px

### Contrast

| Role | Minimum | Tokens used |
|---|---|---|
| Body text | 4.5:1 | `--color-text-primary` on `--color-bg` = 16.8:1 ✓ |
| Secondary text | 4.5:1 | `--color-text-secondary` on `--color-bg` = 5.1:1 ✓ |
| Muted text | 3:1 (large text only) | `--color-text-muted` on `--color-bg` = 3.4:1 — use only for captions/labels |
| Interactive (links) | 3:1 | `--color-text-link` on `--color-bg` = 4.2:1 ✓ |

> Do not use `--color-text-muted` for body copy. Use it only for timestamps, captions, and placeholder text.

### Screen Readers

- All interactive elements must have `aria-label` or `aria-labelledby`
- XP gains announced via `role="status"` live region
- Badge earns announced via `role="alert"` live region
- Progress bars: `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

### Font Scaling

UI must remain functional at 200% browser text zoom. Use `rem` exclusively (tokens are already in `rem`). Never `px` for font sizes in component CSS.

### Haptic Feedback

```javascript
// Streak milestone
navigator.vibrate?.([30, 10, 30]);
// Badge earned
navigator.vibrate?.([50, 20, 50, 20, 100]);
// Set complete
navigator.vibrate?.([15]);
```

---

## 16. PWA Install Prompt

Show custom install banner after 2+ visits, not yet installed. Do not show again after 2 dismissals. Honour `appinstalled` event.

```css
.pwa-install-banner {
  background:    var(--elevation-3-bg);
  border:        var(--border-strong);
  border-radius: var(--radius-xl);
  box-shadow:    var(--shadow-float);
  padding:       var(--space-8);
  z-index:       var(--z-modal);
  animation:     var(--transition-dialog);
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

- **Always** use `var(--token-name)` — never raw hex, raw `px` (except layout values), or raw `rgba()`
- Colours: `--color-{role}` or `--color-{role}-{variant}` (e.g. `--color-success-bg`)
- Spacing: `--space-{n}` for raw values, `--padding-{component}` for semantic aliases
- Borders: `--border-{strength}` for full shorthand, `--border-color-{strength}` for colour-only
- Shadows: `--shadow-{size}` or `--shadow-{semantic}` (e.g. `--shadow-xp`)
- Animation: `--duration-{speed}`, `--ease-{curve}`, `--transition-{preset}`
- Elevation: always pair `--elevation-{n}-bg` + `--elevation-{n}-border` + `--elevation-{n}-shadow`

---

## 18. Migration Notes (v1.0 → v2.0)

| Old | New | Notes |
|---|---|---|
| `--color-surface-2` (modal use) | `--color-surface-3` or `--color-surface-4` | Surface 2 is now explicitly "elevated card" |
| `1px solid var(--color-border)` | `var(--border-default)` | Use the shorthand token |
| `backdrop-filter: blur(12px)` | `backdrop-filter: var(--glass-blur)` | Token is `blur(16px)` — update visually if needed |
| `border-radius: 12px` | `var(--radius-lg)` | Exact match |
| `border-radius: 16px` | `var(--radius-xl)` | Exact match |
| `border-radius: 99px` | `var(--radius-full)` | Exact match |
| `0.6s cubic-bezier(0.34, 1.56, 0.64, 1)` | `var(--duration-slow) var(--ease-bounce)` | Same values, now tokenised |
| `brightness(1.1)` on hover | `var(--gradient-button-hover)` | Switch to gradient-based hover |
| Raw `z-index: 100` | `var(--z-dropdown)` | All z-index must use scale tokens |
| `rgba(0,0,0,0.3)` box-shadow | `var(--shadow-md)` | Match by visual weight |
