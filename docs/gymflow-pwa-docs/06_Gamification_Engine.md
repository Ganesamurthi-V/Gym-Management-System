# GymFlow Member PWA — Gamification Engine

**Version:** 1.1  

---

## 1. Philosophy

The gamification system exists to create intrinsic motivation for gym attendance and workout consistency. Every reward should feel **earned, not given**. The system must feel fair across gym types — a member who attends consistently should outrank someone who only does workouts.

**Core loop:**
```
Behaviour → XP → Level Up → Badge Unlock → Leaderboard Rank → Social Proof → Repeat Behaviour
```

---

## 2. XP System

### 2.1 XP Award Table

| Action | XP Awarded | Notes |
|---|---|---|
| Gym attendance (check-in) | 50 XP | Once per day |
| Complete full workout session | 100 XP | All exercises marked done |
| Complete partial workout (≥50%) | 50 XP | |
| Log progress measurement | 30 XP | Once per week max |
| Upload progress photo | 25 XP | Once per week max |
| Complete a challenge | Variable | Set per challenge (100–500 XP) |
| Refer a friend (joins) | 200 XP | Both referrer + referred |
| Membership renewal | 150 XP | On first payment of renewal |
| 7-day streak | 75 XP bonus | Awarded on day 7 |
| 14-day streak | 150 XP bonus | |
| 30-day streak | 300 XP bonus | |

### 2.2 XP Deductions

No deductions. XP only goes up. Losing a streak does not remove XP.

### 2.3 Level Thresholds

| Level | Title | Total XP Required |
|---|---|---|
| 1 | Beginner | 0 |
| 2 | Regular | 500 |
| 3 | Committed | 1,500 |
| 4 | Dedicated | 3,500 |
| 5 | Athlete | 7,000 |
| 6 | Champion | 12,000 |
| 7 | Elite | 20,000 |
| 8 | Legend | 35,000 |
| 9 | Icon | 60,000 |
| 10 | GymFlow Pro | 100,000 |

**Level formula:**
```javascript
function getLevel(totalXP: number): number {
  const thresholds = [0, 500, 1500, 3500, 7000, 12000, 20000, 35000, 60000, 100000];
  return thresholds.filter(t => totalXP >= t).length;
}
```

### 2.4 XP Processing

XP is awarded asynchronously via the `award_xp` database function:
1. Event fires (attendance recorded, workout session completed, etc.)
2. Supabase trigger or Edge Function calls `award_xp(member_id, gym_id, amount, reason, ref_type, ref_id)`.
3. `xp_transactions` row inserted.
4. `member_xp.total_xp` and `.level` updated atomically.
5. Level-up check: if new level > old level → trigger badge check + notification.

---

## 3. Streak System

### 3.1 Streak Definition

A streak is consecutive calendar days with at least one gym attendance record.

```
Day 1 ✅  Day 2 ✅  Day 3 ✅  Day 4 ❌  Day 5 ✅
         ← 3-day streak →   BREAK    ← 1-day streak →
```

### 3.2 Streak Calculation

Computed in real-time from the `attendance` table using `get_attendance_streak()` DB function. Not cached — always live.

```sql
SELECT get_attendance_streak(member_id) FROM members WHERE id = :id;
```

### 3.3 Streak Milestones and Rewards

| Streak | XP Bonus | Badge Unlocked |
|---|---|---|
| 7 days | 75 XP | "Week Warrior" |
| 14 days | 150 XP | "Fortnight Fighter" |
| 30 days | 300 XP | "Monthly Machine" |
| 60 days | 500 XP | "Iron Discipline" |
| 100 days | 1000 XP | "Century Club" |
| 365 days | 5000 XP | "Year-Round Legend" |

### 3.4 Longest Streak

Stored in `member_xp.longest_streak` column (defined in the `member_xp` table in the Database Schema). Updated inside the `award_xp()` DB function: `GREATEST(member_xp.longest_streak, get_attendance_streak(p_member_id))`. Never decrements.

---

## 4. Badge System

### 4.1 Badge Structure

Each badge has:
- `code` — unique identifier (e.g. `first_workout`)
- `name` — display name
- `description` — how to earn it
- `icon_url` — SVG/PNG icon in Supabase Storage
- `xp_reward` — XP awarded on first earn
- `trigger_type` — one of the trigger types in §4.3; persisted in `badges.trigger_type`

The streak catalogue includes all milestones promised in §3.3: `streak_7`, `streak_14`, `streak_30`, `streak_60`, `streak_100`, and `streak_365`.

### 4.2 Badge Catalogue

#### Attendance Badges

| Code | Name | Trigger |
|---|---|---|
| `first_checkin` | First Step | Attend gym for the first time |
| `streak_7` | Week Warrior | 7-day attendance streak |
| `streak_14` | Fortnight Fighter | 14-day attendance streak |
| `streak_30` | Monthly Machine | 30-day streak |
| `streak_60` | Iron Discipline | 60-day streak |
| `streak_100` | Century Club | 100-day streak |
| `streak_365` | Year-Round Legend | 365-day streak |
| `visits_10` | Getting Started | 10 total visits |
| `visits_50` | Regular | 50 total visits |
| `visits_100` | Centurion | 100 total visits |
| `visits_500` | Veteran | 500 total visits |
| `early_bird` | Early Bird | 5 check-ins before 7am |
| `weekend_warrior` | Weekend Warrior | 10 weekend attendances |

#### Workout Badges

| Code | Name | Trigger |
|---|---|---|
| `first_workout` | First Rep | Complete first workout session |
| `workouts_10` | Grind Starter | 10 completed sessions |
| `workouts_50` | Consistent Lifter | 50 completed sessions |
| `workouts_100` | Iron Regular | 100 completed sessions |
| `perfect_week` | Perfect Week | Complete all assigned workouts in a week |

#### Progress Badges

| Code | Name | Trigger |
|---|---|---|
| `first_measurement` | Know Your Numbers | Log first measurement |
| `first_photo` | Progress Documented | Upload first progress photo |
| `weight_goal` | Goal Crusher | Reach target weight (if set) |
| `measurements_10` | Data Driven | Log 10 measurements |

#### Social & Engagement Badges

| Code | Name | Trigger |
|---|---|---|
| `first_referral` | Recruiter | Refer 1 member who joins |
| `referral_5` | Referral Champion | 5 successful referrals |
| `challenge_1` | Challenge Accepted | Complete first challenge |
| `challenge_5` | Challenge Champion | Complete 5 challenges |
| `renewal` | Loyal Member | Renew membership |
| `renewal_3` | Dedicated Member | Renew 3 times |

### 4.3 Badge Trigger Types

| Trigger Type | When Checked |
|---|---|
| `attendance_count` | After every attendance record |
| `attendance_streak` | After every attendance record |
| `workout_count` | After workout session completed |
| `measurement_count` | After measurement logged |
| `referral_count` | After referral marked "joined" |
| `challenge_complete` | After challenge participation updated |
| `renewal` | After new membership created |

Badge checking runs as a Supabase Edge Function triggered by DB webhooks. Each trigger queries relevant counts and inserts `member_badges` rows for any newly earned badges. Duplicate inserts are ignored via `ON CONFLICT DO NOTHING`.

---

## 5. Leaderboards

### 5.1 Leaderboard Types

| Type | Scope | Reset |
|---|---|---|
| Weekly XP | Per gym | Resets every Monday 00:00 IST |
| Monthly XP | Per gym | Resets 1st of each month 00:00 IST |
| All-time XP | Per gym | Never resets |
| Weekly Attendance | Per gym | Resets every Monday |
| Monthly Attendance | Per gym | Resets monthly |
| All-time Attendance | Per gym | Never resets |

### 5.2 Leaderboard Calculation

All-time leaderboards use `member_xp.total_xp` directly.

Weekly/monthly XP leaderboards aggregate from `xp_transactions`:
```sql
SELECT
  m.id,
  m.name,
  m.photo_url,
  SUM(x.amount) AS period_xp
FROM xp_transactions x
JOIN members m ON m.id = x.member_id
WHERE x.gym_id = :gym_id
  AND x.created_at >= :period_start
GROUP BY m.id, m.name, m.photo_url
ORDER BY period_xp DESC
LIMIT 50;
```

### 5.3 Display Rules

- Show top 50 members.
- Always show current member's rank even if outside top 50 (sticky row at bottom).
- Medals for rank 1, 2, 3 (🥇🥈🥉).
- Anonymous option: gym can allow members to hide their name (future feature).

### 5.4 Privacy

- Only members within the same gym see each other.
- RLS enforces this — leaderboard query scoped to `gym_id` from member's profile.

---

## 6. Challenges

### 6.1 Challenge Types

| Type | Auto-tracked | Manual entry |
|---|---|---|
| Attendance days | ✅ | ❌ |
| Workout sessions | ✅ | ❌ |
| Workout minutes | ✅ | ❌ |
| Weight loss (kg) | ❌ | ✅ (member logs measurement) |
| Water intake days | ❌ | ✅ |
| Custom | ❌ | ✅ |

### 6.2 Challenge Progress Update

For auto-tracked challenges, a Supabase trigger updates `challenge_participants.progress` after the relevant event:

```sql
-- Example: attendance challenge trigger
CREATE OR REPLACE FUNCTION update_attendance_challenges()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE challenge_participants cp
  SET progress = (
    SELECT COUNT(*) FROM attendance a
    WHERE a.member_id = NEW.member_id
      AND a.date BETWEEN c.starts_at AND c.ends_at
  )
  FROM challenges c
  WHERE cp.challenge_id = c.id
    AND cp.member_id = NEW.member_id
    AND c.type = 'attendance'
    AND c.ends_at >= CURRENT_DATE
    AND c.gym_id = NEW.gym_id;

  -- Check completion
  UPDATE challenge_participants cp
  SET completed = TRUE, completed_at = NOW()
  FROM challenges c
  WHERE cp.challenge_id = c.id
    AND cp.member_id = NEW.member_id
    AND cp.progress >= c.target_value
    AND cp.completed = FALSE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 6.3 Challenge UI

- **Challenge card:** Title, description, progress bar, end date countdown, XP reward.
- **Join button:** Tap to join → insert `challenge_participants` row.
- **Progress view:** Bar showing `progress / target_value`.
- **Completed state:** Green checkmark + "Completed! +XXX XP" banner.
- **Expired state:** Greyed out, shows final result.

---

## 7. Rewards UI

### 7.1 Rewards Tab Structure

```
Rewards
├── My Level & XP (hero card)
├── Recent XP Activity (last 10 transactions)
├── Badges (grid, earned + locked)
├── Challenges (active + completed)
└── Leaderboard (tabs: Weekly / Monthly / All-time)
```

### 7.2 Badge Grid

- 4-column grid on mobile.
- Earned: full colour on a `--color-badge-bg` tile with `--color-badge-border` and `--shadow-badge`.
  On the light theme, badges are distinguished by a **tinted fill and coloured border**, not a neon glow — see `04_UI_UX_Guidelines` §2.6.
- Locked: greyscale + lock icon on `--color-locked-bg` with `--color-locked-border`.
- Tap earned badge → detail sheet (name, description, when earned, XP given).
- Tap locked badge → show how to earn it.

### 7.3 Level Up Celebration

On level up (detected via Realtime subscription on `member_xp`):
1. Full-screen overlay appears.
2. New level badge animates in (scale + glow).
3. Confetti burst.
4. "Level X unlocked!" text.
5. Dismiss tap closes overlay.
6. Toast notification persists in notification centre.

---

## 8. Edge Cases

| Scenario | Handling |
|---|---|
| Member checks in twice same day | Second attendance insert ignored (unique constraint); XP awarded only once |
| Backdated attendance by gym owner | XP and streak recalculated from DB function — correct |
| Member deleted and re-added | New `member_id` → XP resets to 0 |
| Gym disables gamification (future flag) | Hide XP bar, badges, leaderboard; XP transactions still record |
| Challenge end date passes with member in progress | Show as "Expired — X% complete"; no XP if not at 100% |
| Tie on leaderboard | Sort by `member_id` DESC as tiebreaker (stable, arbitrary) |
