# GymFlow Member PWA — UI/UX Guidelines

**Version:** 1.0  

---

## 1. Design Philosophy

The GymFlow Member PWA should feel like a premium native fitness app — fast, tactile, and motivating. Every interaction should give immediate feedback. Every screen should communicate progress and energy without being overwhelming.

**Core principles:**
- **Mobile-first, always** — design for 375px wide, scale up
- **Motion communicates state** — use animation purposefully, never decoratively
- **Gamification is visual** — XP, streaks, and badges must feel rewarding
- **Offline is a first-class experience** — degraded state should still feel good
- **Gym branding is respected** — primary colour is dynamically set from gym data

---

## 2. Colour System

### 2.1 Base Palette

```css
:root {
  /* Dynamic gym brand colours (set at runtime from gyms.brand_color) */
  --color-brand:        #6366F1;   /* Indigo — default */
  --color-brand-light:  #818CF8;
  --color-brand-dark:   #4F46E5;
  --color-brand-2:      #8B5CF6;   /* Violet accent — default */

  /* Neutrals */
  --color-bg:           #0F0F13;   /* Near-black background */
  --color-surface:      #1A1A24;   /* Card/surface */
  --color-surface-2:    #24243A;   /* Elevated surface */
  --color-border:       #2E2E4A;
  --color-text-primary: #F8F8FF;
  --color-text-secondary: #94A3B8;
  --color-text-muted:   #64748B;

  /* Semantic */
  --color-success:      #22C55E;
  --color-warning:      #F59E0B;
  --color-error:        #EF4444;
  --color-info:         #38BDF8;

  /* XP / Gamification */
  --color-xp:           #FBBF24;   /* Gold */
  --color-streak:       #F97316;   /* Orange fire */
  --color-badge:        #A78BFA;   /* Purple glow */
}
```

### 2.2 Gym Branding Override

On app load, fetch `gyms.brand_color` and apply:
```javascript
document.documentElement.style.setProperty('--color-brand', gym.brand_color);
document.documentElement.style.setProperty('--color-brand-2', gym.brand_color_2);
```

### 2.3 Dark Mode Only

The PWA is dark-mode only. This matches fitness app conventions and improves OLED battery life on mobile.

---

## 3. Typography

```css
/* Font stack — system fonts for performance */
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;   /* For member codes, QR labels */
```

| Role | Size | Weight | Line Height |
|---|---|---|---|
| Display (hero numbers) | 48px / 3rem | 800 | 1.1 |
| H1 | 28px / 1.75rem | 700 | 1.2 |
| H2 | 22px / 1.375rem | 700 | 1.3 |
| H3 | 18px / 1.125rem | 600 | 1.4 |
| Body | 16px / 1rem | 400 | 1.6 |
| Body Small | 14px / 0.875rem | 400 | 1.5 |
| Caption | 12px / 0.75rem | 400 | 1.4 |
| Label | 11px / 0.6875rem | 600 | 1.2 |

---

## 4. Spacing System

8px base grid. All spacing uses multiples of 4px.

```
4px   — xs  (tight gaps between icon + label)
8px   — sm  (inner padding small components)
12px  — md  (card inner padding)
16px  — lg  (standard section padding)
20px  — xl  
24px  — 2xl (between sections)
32px  — 3xl (page margins top/bottom)
48px  — 4xl (hero sections)
```

**Page horizontal padding:** 16px on mobile, 24px on tablet+.

---

## 5. Component Library

### 5.1 Cards

```
┌─────────────────────────────────────────┐
│  ← 16px padding all sides              │
│                                         │
│  [Icon/Avatar]   Title                  │
│                  Subtitle               │
│                                         │
│  Content area                           │
│                                         │
└─────────────────────────────────────────┘

Background: var(--color-surface)
Border: 1px solid var(--color-border)
Border-radius: 16px
Box-shadow: 0 4px 24px rgba(0,0,0,0.3)
```

**Variants:**
- `card-default` — standard info card
- `card-brand` — brand gradient background, used for membership status
- `card-glass` — `backdrop-filter: blur(12px)`, used over hero images
- `card-highlight` — glowing left border in `--color-brand`

### 5.2 Buttons

```
Primary:   bg-brand, text-white, hover: brightness(1.1)
Secondary: bg-surface-2, text-primary, border-border
Ghost:     transparent, text-brand, hover: bg-surface
Danger:    bg-error/20, text-error, hover: bg-error/30
```

Height: 48px (minimum touch target).  
Border-radius: 12px.  
Font: 15px, weight 600.  
Padding: 0 24px.

**Loading state:** Replace label with spinner, disable button.  
**Success state:** Brief checkmark animation before resetting.

### 5.3 Bottom Navigation

```
┌────────────────────────────────────────┐
│  🏠      🏋️      📈      🎁      👤  │
│  Home  Workout Progress Rewards Profile│
└────────────────────────────────────────┘

Height: 64px + safe-area-inset-bottom
Background: var(--color-surface) with blur
Border-top: 1px solid var(--color-border)
Active tab: icon + label in var(--color-brand)
Inactive: var(--color-text-muted)
Badge: red dot at top-right of icon for notifications
```

### 5.4 Progress Bars

```css
.progress-bar {
  height: 8px;
  background: var(--color-border);
  border-radius: 99px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-brand), var(--color-brand-2));
  border-radius: 99px;
  transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 5.5 XP Bar

Special progress bar for gamification. Shows current XP within level.

```
Level 5  ████████████░░░░  2,340 / 3,000 XP  → Level 6
         [gradient: gold to orange]
```

### 5.6 Streak Counter

```
┌───────────────┐
│  🔥  14       │
│  Day Streak   │
└───────────────┘

Animate the flame emoji with a gentle pulse when streak > 0.
```

### 5.7 Stats Pills

Small, horizontally scrollable pills for quick stats on Dashboard.

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ 📅 14 days left│  │ 🏋 23 workouts │  │ 📊 87% attend  │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## 6. Navigation

### 6.1 Bottom Nav (primary)

5 tabs: Home, Workout, Progress, Rewards, Profile.  
No header navigation on mobile.

### 6.2 Back Navigation

Use the browser/OS back gesture. Provide a `←` back button in secondary screens (pushed views).

### 6.3 Modal Sheets

Use bottom sheets instead of full-screen modals for secondary actions (e.g., workout set completion, filter options).

```
Sheet heights:
- Short:  40% viewport (quick actions)
- Medium: 65% viewport (forms, filters)
- Tall:   90% viewport (complex flows)
```

---

## 7. Motion & Animation

All animations respect `prefers-reduced-motion`.

| Interaction | Animation | Duration | Easing |
|---|---|---|---|
| Page transition | Slide up + fade | 300ms | ease-out |
| Card tap | Scale 0.97 | 100ms | ease |
| Button tap | Scale 0.95 | 80ms | ease |
| Modal open | Slide up from bottom | 350ms | spring |
| XP gain | Counter increment + glow | 800ms | ease-out |
| Badge earn | Scale in + confetti | 1000ms | spring |
| Streak milestone | Shake + pulse | 600ms | spring |
| Set complete | Checkmark draw | 400ms | ease-in-out |
| Progress bar fill | Width expand | 600ms | spring |

### 7.1 Micro-interactions

- **Workout set complete:** Checkbox animates with a green checkmark draw, row fades slightly.
- **XP earned:** Floating "+50 XP" text rises and fades above the action.
- **Badge earned:** Full-screen overlay with badge zoom + particle burst.
- **Streak milestone:** Flame grows and glows, brief haptic on mobile.

---

## 8. Screen-specific UX Notes

### 8.1 Home Dashboard
- Welcome message changes based on time of day (Good Morning / Afternoon / Evening).
- Membership status card shows urgency colour: green (>14 days), amber (7–14 days), red (<7 days).
- Cards are vertically stacked, scroll naturally — no grids on mobile.

### 8.2 Digital Membership Card
- Full-screen card optimised for scanning.
- QR code must be minimum 200×200px.
- Auto-brightness: set screen brightness to 100% when card is shown, restore on exit.
- Card flip animation to reveal barcode (future).

### 8.3 Workout Tracker
- Focused mode: minimal UI, large touch targets.
- Timer prominently displayed during rest.
- Swipe left on a set to mark as skipped.
- End workout requires confirmation (prevents accidental tap).

### 8.4 Progress Charts
- Default to 30-day view; allow 7d / 90d / all-time.
- Recharts with custom tooltip matching dark theme.
- Empty state: illustrated placeholder with "Log your first measurement."

### 8.5 Leaderboard
- Current member highlighted and always visible (sticky position if off-screen).
- Smooth scroll to member position on load.

---

## 9. Empty States

Every list/data screen must have an empty state.

| Screen | Empty State Illustration | CTA |
|---|---|---|
| Workout | Person at gym | "Your trainer hasn't assigned a plan yet" |
| Progress | Chart outline | "Log your first measurement" |
| Attendance | Calendar | "Come in to start your streak!" |
| Notifications | Bell | "You're all caught up" |
| Achievements | Trophy | "Complete workouts to earn badges" |

---

## 10. Error States

- **Network error:** Toast at bottom: "No connection. Showing cached data." with offline icon.
- **Auth error:** Redirect to login with "Your session expired. Please log in again."
- **404 / not found:** Friendly message + back button.
- **Server error:** "Something went wrong. Please try again." with retry button.

---

## 11. Accessibility

- All interactive elements have `aria-label`.
- Touch targets: minimum 44×44px (recommended 48×48px).
- Contrast ratio: minimum 4.5:1 for body text, 3:1 for large text.
- Focus rings: visible, styled to brand colour.
- Screen reader: announce XP gains, badge earns as live regions.
- Font scaling: UI must not break at 200% font size.
- Haptic feedback: use `navigator.vibrate()` for milestone events.

---

## 12. PWA Install Prompt UX

Show a custom install banner after the user has visited 2+ times and not installed yet.

```
┌────────────────────────────────────────┐
│  📱 Add GymFlow to your home screen   │
│  Access your membership anytime        │
│  [Install]              [Not Now]      │
└────────────────────────────────────────┘
```

Do not show again after dismissed 2 times. Respect `appinstalled` event.
