# GymFlow Member PWA — Achievement Rarity System
## Kiro Implementation Spec

> **Scope:** Rewards / Achievements page in the Member PWA only.  
> Do **not** modify unrelated pages, the XP system logic, or the gym-owner dashboard.

---

## 0. Pre-Implementation Checklist

Before writing any code, Kiro must read and understand the existing state:

- [ ] Read `IMPLEMENTATION_LOG.md` and `CHANGELOG.md`
- [ ] Locate the existing Rewards/Achievements page component — do NOT assume a path, find it
- [ ] Locate the existing achievement types/interfaces (search for `Achievement`, `achievement`, `unlocked`)
- [ ] Locate the existing design token file (CSS variables or Tailwind config)
- [ ] Locate the XP and level system hooks/services — understand the data shape
- [ ] Locate the Supabase schema for `members`, check-in tables, streak columns, membership/renewal tables
- [ ] Check if workout tracking data exists in the database — if not, mark workout achievements as `pending` (do not implement unlock logic for them yet)
- [ ] Identify the existing card component(s) used in the Rewards page — reuse, do not recreate

If any of the above cannot be found, stop and report what is missing before proceeding.

---

## 1. Add Rarity Design Tokens

**File:** The existing CSS variables / design token file (find it, do not create a duplicate).

Add these tokens to the existing token block — do not hardcode colors anywhere else:

```css
--color-rarity-common: #94A3B8;
--color-rarity-rare: #3B82F6;
--color-rarity-epic: #8B5CF6;
--color-rarity-legendary: #F59E0B;
--color-rarity-mythic: #EC4899;
```

If the project uses a Tailwind config instead of CSS variables, extend the `theme.colors` object with a `rarity` key mapping the same values.

---

## 2. Achievement Type Definitions

**File:** Extend the existing achievement types file. If one does not exist, create `lib/types/achievements.ts`.

```typescript
export type AchievementRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

export type AchievementCategory =
  | "attendance"
  | "streak"
  | "workout"   // only activate when workout data exists in DB
  | "membership"
  | "xp"
  | "special";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  /** Threshold value for unlock (check-ins, streak days, XP, etc.) */
  requirement: number;
  icon: string; // emoji or icon key
  unlocked: boolean;
  unlockedAt?: string; // ISO timestamp
  /** Current progress toward requirement. Omit if not measurable. */
  progress?: number;
  /** If true, the underlying data source is not yet available */
  pendingBackend?: boolean;
}
```

Do **not** duplicate this interface if a compatible one already exists — extend it instead.

---

## 3. Achievement Definitions

**File:** `lib/achievements/definitions.ts` (create if absent)

Define all achievements as a static array. Use the rarity tokens by name, not hardcoded values.

### Attendance

| id | name | rarity | requirement | description |
|----|------|--------|-------------|-------------|
| `att-welcome` | Welcome Aboard | common | 0 | Activated Member Portal |
| `att-first-checkin` | First Check-in | common | 1 | 1 check-in |
| `att-week-warrior` | Week Warrior | rare | 5 | 5 check-ins in one week |
| `att-month-hustler` | Month Hustler | rare | 10 | 10 check-ins in one month |
| `att-consistency-king` | Consistency King | epic | 50 | 50 total check-ins |
| `att-century-club` | Century Club | legendary | 100 | 100 total check-ins |
| `att-iron-veteran` | Iron Veteran | mythic | 250 | 250 total check-ins |

### Streak

| id | name | rarity | requirement | description |
|----|------|--------|-------------|-------------|
| `str-3day` | 3-Day Spark | common | 3 | 3-day streak |
| `str-7day` | 7-Day Fire | rare | 7 | 7-day streak |
| `str-14day` | 14-Day Unstoppable | epic | 14 | 14-day streak |
| `str-30day` | 30-Day Beast | legendary | 30 | 30-day streak |
| `str-90day` | 90-Day Legend | mythic | 90 | 90-day streak |

### Workout _(mark `pendingBackend: true` unless workout table confirmed in DB)_

| id | name | rarity | requirement | description |
|----|------|--------|-------------|-------------|
| `wrk-first` | First Workout | common | 1 | Complete 1 workout |
| `wrk-warrior` | Workout Warrior | rare | 25 | Complete 25 workouts |
| `wrk-machine` | Training Machine | epic | 50 | Complete 50 workouts |
| `wrk-legend` | Workout Legend | legendary | 100 | Complete 100 workouts |
| `wrk-250club` | 250 Club | mythic | 250 | Complete 250 workouts |

### Membership

| id | name | rarity | requirement | description |
|----|------|--------|-------------|-------------|
| `mem-welcome` | Welcome Aboard | common | 0 | Activate Member Portal |
| `mem-first-renewal` | First Renewal | rare | 1 | Renew membership once |
| `mem-committed` | Committed Member | epic | 3 | 3 renewals |
| `mem-loyalist` | Gym Loyalist | legendary | 6 | 6 renewals |
| `mem-one-year` | One Year Strong | mythic | 365 | 1 year continuous membership |

### XP

| id | name | rarity | requirement | description |
|----|------|--------|-------------|-------------|
| `xp-start` | Getting Started | common | 100 | Earn 100 XP |
| `xp-rising` | Rising Strong | rare | 250 | Earn 250 XP |
| `xp-power` | Power Player | epic | 1000 | Earn 1,000 XP |
| `xp-elite` | Elite Member | legendary | 2500 | Earn 2,500 XP |
| `xp-hall` | Hall of Fame | mythic | 10000 | Earn 10,000 XP |

### Special

| id | name | rarity | requirement | description | notes |
|----|------|--------|-------------|-------------|-------|
| `spc-early-bird` | Early Bird | rare | 10 | 10 check-ins before 7:00 AM | needs time-of-check-in data |
| `spc-perfect-week` | Perfect Week | epic | 1 | Complete every scheduled workout in a week | needs workout schedule data |
| `spc-challenge` | Challenge Champion | legendary | 1 | Win a gym challenge | needs challenge data |
| `spc-unbreakable` | Unbreakable | mythic | 180 | 180-day attendance streak | uses streak column |

Mark `spc-perfect-week` and `spc-challenge` as `pendingBackend: true` if data is unavailable.

---

## 4. Achievement Evaluation Service

**File:** `lib/achievements/evaluator.ts` (create if absent)

Do **not** put logic inside React components.

```typescript
/**
 * Given member stats, returns the full achievement list with
 * `unlocked` and `progress` fields populated.
 */
export function evaluateAchievements(
  stats: MemberStats,
  definitions: Achievement[]
): Achievement[]
```

`MemberStats` shape (adapt to match your existing data layer):

```typescript
interface MemberStats {
  totalCheckins: number;
  currentStreak: number;
  weeklyCheckins: number;
  monthlyCheckins: number;
  totalWorkouts?: number;         // optional — only if table exists
  renewalCount: number;
  membershipStartDate: string;    // ISO
  totalXP: number;
  earlyMorningCheckins?: number;  // optional — only if time data exists
  portalActivated: boolean;
}
```

Evaluation rules:
- Attendance: compare `totalCheckins` to `requirement`
- Streak: compare `currentStreak` to `requirement`
- Workout: compare `totalWorkouts` (skip if undefined)
- Membership/renewal: compare `renewalCount` or days-since-`membershipStartDate`
- XP: compare `totalXP` to `requirement`
- Special: only evaluate if the required data field is present

Return achievements with:
- `unlocked: true/false`
- `progress: currentValue` (the raw number, not a percentage — the UI does the math)
- `pendingBackend: true` if data field is undefined

---

## 5. Data Hook

**File:** `hooks/useAchievements.ts` — extend the existing hook if one exists, else create it.

```typescript
export function useAchievements(): {
  earned: Achievement[];
  locked: Achievement[];
  isLoading: boolean;
}
```

Rules:
- Pull `MemberStats` from the existing data source (Supabase query / existing hook)
- Run `evaluateAchievements()` — do not inline logic here
- Split result:
  ```typescript
  const earned = all.filter(a => a.unlocked);
  const locked = all.filter(a => !a.unlocked);
  ```
- Never show a `pendingBackend` achievement unless its underlying data exists

---

## 6. Achievement Card Component

**File:** Update the existing achievement card component. If none exists, create `components/achievements/AchievementCard.tsx`.

### Rarity visual treatment

| Rarity | Icon bg | Border | Label | Progress bar | Glow |
|--------|---------|--------|-------|--------------|------|
| Common | `--color-rarity-common` at 15% opacity | 1px solid at 30% opacity | slate text | slate | none |
| Rare | `--color-rarity-rare` at 15% opacity | blue | blue text | blue | none |
| Epic | `--color-rarity-epic` at 15% opacity | purple | purple text | purple | none |
| Legendary | `--color-rarity-legendary` at 15% opacity | gold | gold text | gold | none |
| Mythic | `--color-rarity-mythic` at 15% opacity | pink | pink text | pink | subtle pulse animation (unlocked only) |

**Rules:**
- Do NOT make the full card a solid rarity color
- Do NOT hardcode colors — use `var(--color-rarity-*)` or the Tailwind `rarity` tokens
- Rarity must be communicated by **text label** (`COMMON`, `RARE`, etc.) in addition to color
- Locked achievements show 🔒 icon and a muted/desaturated style
- Progress bar only renders when `progress` is defined and `!unlocked`

### Card anatomy

```
┌──────────────────────────┐
│  [icon bg]  🏋️           │  ← icon with rarity-tinted background
│                          │
│  Consistency King        │  ← bold, existing typography token
│  50 total check-ins      │  ← muted, smaller
│                          │
│  ████████████░░░  32/50  │  ← progress bar (locked only, if measurable)
│                          │
│  ● EPIC                  │  ← rarity dot + label, using token color
└──────────────────────────┘
```

Locked variant — same layout with:
- 🔒 replacing the achievement icon
- icon bg desaturated
- card opacity reduced (~60%)
- progress bar visible if measurable

Accessibility:
- `aria-label` on icon: `"Achievement icon: {name}"`
- Rarity label must be visible text (not color-only)
- `prefers-reduced-motion`: disable the Mythic glow animation
- Color contrast ≥ 4.5:1 for all text

---

## 7. Rewards Page Updates

**File:** The existing Rewards/Achievements page component.

### Changes only — do not redesign the page

1. Replace the existing achievement rendering with rarity-aware cards
2. Replace existing earned/locked split with the hook output
3. Group earned achievements by rarity (descending: Mythic → Common):

```
── Earned ──────────────────

  Mythic
  [ card ]

  Legendary
  [ card ] [ card ]

  Epic
  [ card ]

  Rare
  [ card ] [ card ]

  Common
  [ card ] [ card ] [ card ]

── Locked ──────────────────

  (same rarity ordering)
```

4. Empty state: if `earned.length === 0`, show a friendly message ("Keep training — your first achievement is waiting!")
5. Loading state: use existing skeleton/spinner pattern
6. Do NOT modify XP display, level display, or any other section of the Rewards page

---

## 8. Filtering Guard

Enforce in the hook output (belt-and-suspenders):

```typescript
// Safety check — an achievement must appear in exactly one list
const allIds = [...earned, ...locked].map(a => a.id);
const uniqueIds = new Set(allIds);
if (allIds.length !== uniqueIds.size) {
  console.error('[Achievements] Duplicate achievement IDs detected');
}
```

No achievement may appear in both `earned` and `locked`.

---

## 9. Mobile Requirements

- Cards must not overflow horizontally on 375px viewport
- Rarity labels must remain readable at small size (min 11px, prefer 12px)
- Locked cards must be visually distinct without relying on color alone
- Touch targets ≥ 44px
- Mythic animation must not cause layout shift or janky scroll

---

## 10. Deliverables

Kiro must produce:

| # | Deliverable | Action |
|---|-------------|--------|
| 1 | Rarity design tokens | Add to existing token file |
| 2 | `AchievementRarity`, `AchievementCategory`, `Achievement` types | Extend or create |
| 3 | `lib/achievements/definitions.ts` | Create |
| 4 | `lib/achievements/evaluator.ts` | Create |
| 5 | `hooks/useAchievements.ts` | Extend or create |
| 6 | Achievement card component | Update or create |
| 7 | Rewards page — rarity grouping + new cards | Update existing page only |
| 8 | `CHANGELOG.md` | Update |
| 9 | `IMPLEMENTATION_LOG.md` | Update |

---

## 11. Completion Report

At the end of the implementation, Kiro must output:

```
## Achievement Rarity System — Implementation Report

### Files Created
- ...

### Files Modified
- ...

### Achievement System Architecture
- Evaluation is in: [file]
- Definitions are in: [file]
- Hook is in: [file]
- Card is in: [file]

### Rarity Tokens Location
- [file, line range]

### Workout Achievements Status
- [ ] Implemented (workout table confirmed in DB)
- [ ] Marked pendingBackend (table not found)

### Special Achievements Status
- Early Bird: [implemented / pending — reason]
- Perfect Week: [implemented / pending — reason]
- Challenge Champion: [implemented / pending — reason]
- Unbreakable: [implemented / pending — reason]

### Assumptions Made
- ...

### Features Requiring Future Backend Data
- ...
```

---

## Hard Constraints

- Do **not** break the existing XP or level system
- Do **not** redesign unrelated sections of the Rewards page
- Do **not** introduce arbitrary hardcoded colors — only `var(--color-rarity-*)` or Tailwind rarity tokens
- Do **not** put achievement evaluation logic inside React components
- Do **not** implement workout achievements if the workout table does not exist in the DB
- Do **not** duplicate types or interfaces that already exist
- An achievement must appear in exactly **one** section (earned OR locked, never both)
