# GymFlow Member PWA — Database Schema

**Version:** 1.0  
**Database:** PostgreSQL 15 via Supabase  
**Schema:** `public`  

> This schema extends the existing GymFlow Admin Portal database. Member PWA reads from and writes to the same tables. New tables added for PWA-specific features are marked **[PWA NEW]**.

---

## 1. Core Tables

### 1.1 `gyms`

```sql
CREATE TABLE gyms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,         -- URL-safe identifier
  logo_url      TEXT,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  city          TEXT,
  state         TEXT,
  brand_color   TEXT DEFAULT '#6366F1',       -- Primary colour for theming
  brand_color_2 TEXT DEFAULT '#8B5CF6',       -- Accent colour
  timezone      TEXT DEFAULT 'Asia/Kolkata',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.2 `members`

```sql
CREATE TABLE IF NOT EXISTS members (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id            UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_number     INTEGER     NOT NULL,
  name              TEXT        NOT NULL,
  phone             TEXT        NOT NULL,
  gender            TEXT        CHECK (gender IN ('male', 'female', 'other')),
  area              TEXT,
  age               INTEGER     CHECK (age > 0 AND age < 120),
  date_of_birth     DATE,                    -- Used for automated birthday_wishes WhatsApp messages
  pending_amount    INTEGER     NOT NULL DEFAULT 0,
  legacy_member_id  TEXT        DEFAULT NULL, -- Original ID from an external/legacy system, preserved during import
  is_imported       BOOLEAN     NOT NULL DEFAULT false, -- True for members created via Excel/CSV import; suppresses welcome template
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, member_number)
);

CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(gym_id, member_number);
CREATE INDEX IF NOT EXISTS idx_members_gym_created ON members(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_gym_dues ON members(gym_id, pending_amount) WHERE pending_amount > 0;
```

### 1.3 `membership_plans`

```sql
CREATE TABLE membership_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id       UUID NOT NULL REFERENCES gyms(id),
  name         TEXT NOT NULL,
  duration_days INT NOT NULL,
  price        NUMERIC(10,2) NOT NULL,
  features     JSONB DEFAULT '[]',           -- Array of benefit strings
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.4 `memberships`

```sql
CREATE TABLE memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID NOT NULL REFERENCES members(id),
  gym_id     UUID NOT NULL REFERENCES gyms(id),
  plan_id    UUID NOT NULL REFERENCES membership_plans(id),
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','expired','paused','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memberships_member_id ON memberships(member_id);
CREATE INDEX idx_memberships_end_date ON memberships(end_date);
```

### 1.5 `payments`

```sql
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID NOT NULL REFERENCES members(id),
  gym_id         UUID NOT NULL REFERENCES gyms(id),
  membership_id  UUID REFERENCES memberships(id),
  amount         NUMERIC(10,2) NOT NULL,
  payment_mode   TEXT CHECK (payment_mode IN ('cash','upi','card','bank_transfer','other')),
  status         TEXT DEFAULT 'paid' CHECK (status IN ('paid','pending','failed','refunded')),
  invoice_number TEXT UNIQUE,
  notes          TEXT,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_member_id ON payments(member_id);
```

---

## 2. Attendance Tables

### 2.1 `attendance`

```sql
CREATE TABLE attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id),
  gym_id       UUID NOT NULL REFERENCES gyms(id),
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_at  TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  source       TEXT DEFAULT 'manual'
               CHECK (source IN ('manual','qr','biometric','admin')),
  session_type TEXT DEFAULT 'gym'
               CHECK (session_type IN ('gym','class','pt')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (member_id, date, session_type)   -- Idempotent: one punch per session per day
);

CREATE INDEX idx_attendance_member_date ON attendance(member_id, date DESC);
CREATE INDEX idx_attendance_gym_date ON attendance(gym_id, date DESC);
```

---

## 3. Workout Tables

### 3.1 `workout_plans`

```sql
CREATE TABLE workout_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID NOT NULL REFERENCES gyms(id),
  member_id   UUID REFERENCES members(id),   -- NULL = template plan
  trainer_id  UUID REFERENCES members(id),
  name        TEXT NOT NULL,
  description TEXT,
  goal        TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 `workout_days`

```sql
CREATE TABLE workout_days (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_number   INT NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  day_name     TEXT,                          -- e.g. "Push Day", "Chest & Triceps"
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 `workout_exercises`

```sql
CREATE TABLE workout_exercises (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id       UUID NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sets         INT NOT NULL DEFAULT 3,
  reps         TEXT NOT NULL DEFAULT '10',    -- TEXT to allow ranges like "8-12"
  weight       TEXT,                          -- e.g. "20kg" or "bodyweight"
  rest_seconds INT DEFAULT 60,
  notes        TEXT,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 `workout_sessions` **[PWA NEW]**

```sql
CREATE TABLE workout_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id),
  gym_id       UUID NOT NULL REFERENCES gyms(id),
  plan_id      UUID REFERENCES workout_plans(id),
  day_id       UUID REFERENCES workout_days(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_min INT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_sessions_member ON workout_sessions(member_id, started_at DESC);
```

### 3.5 `workout_session_sets` **[PWA NEW]**

```sql
CREATE TABLE workout_session_sets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id  UUID NOT NULL REFERENCES workout_exercises(id),
  set_number   INT NOT NULL,
  reps_done    INT,
  weight_done  TEXT,
  completed    BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Progress & Measurements

### 4.1 `progress_measurements` **[PWA NEW]**

```sql
CREATE TABLE progress_measurements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id),
  gym_id       UUID NOT NULL REFERENCES gyms(id),
  measured_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg    NUMERIC(5,2),
  body_fat_pct NUMERIC(5,2),
  bmi          NUMERIC(5,2),
  chest_cm     NUMERIC(5,2),
  waist_cm     NUMERIC(5,2),
  hips_cm      NUMERIC(5,2),
  arms_cm      NUMERIC(5,2),
  shoulders_cm NUMERIC(5,2),
  thighs_cm    NUMERIC(5,2),
  notes        TEXT,
  recorded_by  UUID REFERENCES members(id),  -- NULL = self-reported
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_measurements_member ON progress_measurements(member_id, measured_at DESC);
```

### 4.2 `progress_photos` **[PWA NEW]**

```sql
CREATE TABLE progress_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES members(id),
  gym_id      UUID NOT NULL REFERENCES gyms(id),
  photo_url   TEXT NOT NULL,
  photo_type  TEXT DEFAULT 'progress'
              CHECK (photo_type IN ('before','progress','after')),
  taken_at    DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. Diet Plans

### 5.1 `diet_plans`

```sql
CREATE TABLE diet_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID NOT NULL REFERENCES gyms(id),
  member_id   UUID REFERENCES members(id),
  trainer_id  UUID REFERENCES members(id),
  name        TEXT NOT NULL,
  goal        TEXT,
  calories    INT,
  protein_g   INT,
  carbs_g     INT,
  fats_g      INT,
  water_ml    INT DEFAULT 3000,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 `diet_meals`

```sql
CREATE TABLE diet_meals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES diet_plans(id) ON DELETE CASCADE,
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','snacks','dinner','pre_workout','post_workout')),
  description TEXT NOT NULL,
  calories    INT,
  protein_g   NUMERIC(5,1),
  carbs_g     NUMERIC(5,1),
  fats_g      NUMERIC(5,1),
  sort_order  INT DEFAULT 0
);
```

---

## 6. Gamification Tables

### 6.1 `member_xp` **[PWA NEW]**

```sql
CREATE TABLE member_xp (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES members(id),
  gym_id      UUID NOT NULL REFERENCES gyms(id),
  total_xp    INT NOT NULL DEFAULT 0,
  level       INT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (member_id, gym_id)
);
```

### 6.2 `xp_transactions` **[PWA NEW]**

```sql
CREATE TABLE xp_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES members(id),
  gym_id      UUID NOT NULL REFERENCES gyms(id),
  amount      INT NOT NULL,                   -- Can be negative
  reason      TEXT NOT NULL,
  ref_type    TEXT,                           -- 'attendance', 'workout', 'challenge' etc.
  ref_id      UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_xp_transactions_member ON xp_transactions(member_id, created_at DESC);
```

### 6.3 `badges` **[PWA NEW]**

```sql
CREATE TABLE badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID REFERENCES gyms(id),       -- NULL = global badge
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  icon_url    TEXT,
  xp_reward   INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.4 `member_badges` **[PWA NEW]**

```sql
CREATE TABLE member_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES members(id),
  gym_id      UUID NOT NULL REFERENCES gyms(id),
  badge_id    UUID NOT NULL REFERENCES badges(id),
  earned_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (member_id, badge_id)
);
```

### 6.5 `challenges` **[PWA NEW]**

```sql
CREATE TABLE challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id       UUID NOT NULL REFERENCES gyms(id),
  title        TEXT NOT NULL,
  description  TEXT,
  type         TEXT NOT NULL CHECK (type IN ('attendance','workout','weight_loss','custom')),
  period       TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  target_value NUMERIC,
  xp_reward    INT DEFAULT 100,
  starts_at    DATE NOT NULL,
  ends_at      DATE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.6 `challenge_participants` **[PWA NEW]**

```sql
CREATE TABLE challenge_participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id),
  member_id    UUID NOT NULL REFERENCES members(id),
  progress     NUMERIC DEFAULT 0,
  completed    BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (challenge_id, member_id)
);
```

---

## 7. Notifications & Referrals

### 7.1 `notifications` **[PWA NEW]**

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES members(id),
  gym_id      UUID NOT NULL REFERENCES gyms(id),
  type        TEXT NOT NULL CHECK (type IN ('membership','payment','workout','diet','announcement','challenge','reward','system')),
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB,                          -- Arbitrary payload for deep-linking
  is_read     BOOLEAN DEFAULT FALSE,
  sent_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_member ON notifications(member_id, sent_at DESC);
```

### 7.2 `push_subscriptions` **[PWA NEW]**

```sql
CREATE TABLE push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id),
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.3 `referrals` **[PWA NEW]**

```sql
CREATE TABLE referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES members(id),
  gym_id        UUID NOT NULL REFERENCES gyms(id),
  referral_code TEXT NOT NULL UNIQUE,
  referred_id   UUID REFERENCES members(id),
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','joined','rewarded')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  rewarded_at   TIMESTAMPTZ
);
```

---

## 8. Key RLS Policies

```sql
-- Gym owners can view, insert, update, and delete their members
CREATE POLICY "Gym owners can view their members"
  ON members FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert members"
  ON members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update members"
  ON members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete members"
  ON members FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

-- Members can read their own membership
CREATE POLICY "membership_self" ON memberships
  FOR SELECT USING (member_id = auth.uid());

-- Members can read/insert their own attendance
CREATE POLICY "attendance_self_read" ON attendance
  FOR SELECT USING (member_id = auth.uid());

-- Members can insert their own workout sessions
CREATE POLICY "workout_session_self" ON workout_sessions
  FOR ALL USING (member_id = auth.uid());

-- Members can read gym info for their gym
CREATE POLICY "gym_member_read" ON gyms
  FOR SELECT USING (
    id IN (SELECT gym_id FROM members WHERE id = auth.uid())
  );

-- Members can read workout plans assigned to them
CREATE POLICY "workout_plan_self" ON workout_plans
  FOR SELECT USING (
    member_id = auth.uid() OR member_id IS NULL
  );

-- Members can read notifications addressed to them
CREATE POLICY "notifications_self" ON notifications
  FOR SELECT USING (member_id = auth.uid());

-- Members can update is_read on their own notifications
CREATE POLICY "notifications_self_update" ON notifications
  FOR UPDATE USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());
```

---

## 9. Database Functions

```sql
-- Compute attendance streak for a member
CREATE OR REPLACE FUNCTION get_attendance_streak(p_member_id UUID)
RETURNS INT AS $$
DECLARE
  streak INT := 0;
  check_date DATE := CURRENT_DATE;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM attendance
    WHERE member_id = p_member_id AND date = check_date
  ) LOOP
    streak := streak + 1;
    check_date := check_date - INTERVAL '1 day';
  END LOOP;
  RETURN streak;
END;
$$ LANGUAGE plpgsql STABLE;

-- Award XP and update member_xp total
CREATE OR REPLACE FUNCTION award_xp(
  p_member_id UUID,
  p_gym_id UUID,
  p_amount INT,
  p_reason TEXT,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO xp_transactions (member_id, gym_id, amount, reason, ref_type, ref_id)
  VALUES (p_member_id, p_gym_id, p_amount, p_reason, p_ref_type, p_ref_id);

  INSERT INTO member_xp (member_id, gym_id, total_xp)
  VALUES (p_member_id, p_gym_id, p_amount)
  ON CONFLICT (member_id, gym_id)
  DO UPDATE SET
    total_xp = member_xp.total_xp + p_amount,
    level = GREATEST(1, FLOOR((member_xp.total_xp + p_amount) / 500) + 1)::INT,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
```