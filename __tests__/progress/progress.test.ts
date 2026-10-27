import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bodyLogSchema, workoutSessionSchema, mapBodyLogRow, mapSessionRow } from '@/lib/progress/validate'
import { buildLastWeights } from '@/lib/progress/lastWeights'
import type { SessionExerciseRecord } from '@/types/progress'

const CID = '3f2c1a9e-1111-4222-8333-444455556666'

describe('bodyLogSchema', () => {
  it('coerces numeric strings and turns empty strings into null', () => {
    const r = bodyLogSchema.parse({ weight_kg: '72.5', waist_cm: '', chest_cm: null })
    expect(r.weight_kg).toBe(72.5)
    expect(r.waist_cm).toBeNull()
    expect(r.chest_cm).toBeNull()
    expect(r.arm_cm).toBeNull()
  })
  it('needs at least one measurement', () => {
    expect(bodyLogSchema.safeParse({}).success).toBe(false)
    expect(bodyLogSchema.safeParse({ weight_kg: '', waist_cm: '' }).success).toBe(false)
  })
  it('enforces the bounds', () => {
    expect(bodyLogSchema.safeParse({ weight_kg: 19.9 }).success).toBe(false)
    expect(bodyLogSchema.safeParse({ weight_kg: 300.1 }).success).toBe(false)
    expect(bodyLogSchema.safeParse({ weight_kg: 20 }).success).toBe(true)
    expect(bodyLogSchema.safeParse({ waist_cm: 9 }).success).toBe(false)
    expect(bodyLogSchema.safeParse({ thigh_cm: 251 }).success).toBe(false)
    expect(bodyLogSchema.safeParse({ weight_kg: 'abc' }).success).toBe(false)
  })
  it('checks the date format', () => {
    expect(bodyLogSchema.safeParse({ weight_kg: 70, logged_on: '2026-10-27' }).success).toBe(true)
    expect(bodyLogSchema.safeParse({ weight_kg: 70, logged_on: '27/10/2026' }).success).toBe(false)
    expect(bodyLogSchema.safeParse({ weight_kg: 70, logged_on: '' }).success).toBe(true)
  })
})

describe('workoutSessionSchema', () => {
  const base = {
    client_id: CID,
    program_name: '  Push  ',
    day_label: 'Day 1',
    started_at: '2026-10-27T10:00:00.000Z',
    duration_seconds: '3600',
    exercises: [{ name: '  Bench Press ', sets: [{ reps: '8', weight_kg: '60', done: true }, { reps: '', weight_kg: '', done: false }] }],
  }
  it('trims names and coerces numbers', () => {
    const r = workoutSessionSchema.parse(base)
    expect(r.program_name).toBe('Push')
    expect(r.duration_seconds).toBe(3600)
    expect(r.exercises[0].name).toBe('Bench Press')
    expect(r.exercises[0].sets[0]).toEqual({ reps: 8, weight_kg: 60, done: true })
    expect(r.exercises[0].sets[1]).toEqual({ reps: null, weight_kg: null, done: false })
  })
  it('rejects bad input', () => {
    expect(workoutSessionSchema.safeParse({ ...base, client_id: 'x' }).success).toBe(false)
    expect(workoutSessionSchema.safeParse({ ...base, exercises: [] }).success).toBe(false)
    expect(workoutSessionSchema.safeParse({ ...base, duration_seconds: 86401 }).success).toBe(false)
    expect(workoutSessionSchema.safeParse({ ...base, started_at: 'yesterday' }).success).toBe(false)
    const long = { ...base, exercises: [{ name: 'x'.repeat(81), sets: [{ reps: 1, weight_kg: 1, done: true }] }] }
    expect(workoutSessionSchema.safeParse(long).success).toBe(false)
    const heavy = { ...base, exercises: [{ name: 'a', sets: [{ reps: 1, weight_kg: 501, done: true }] }] }
    expect(workoutSessionSchema.safeParse(heavy).success).toBe(false)
    const manySets = { ...base, exercises: [{ name: 'a', sets: Array.from({ length: 21 }, () => ({ reps: 1, weight_kg: 1, done: true })) }] }
    expect(workoutSessionSchema.safeParse(manySets).success).toBe(false)
  })
})

describe('mappers', () => {
  it('maps a body log row, accepting numeric strings', () => {
    expect(mapBodyLogRow({ id: 'a', logged_on: '2026-10-27', weight_kg: '72.50', waist_cm: null, chest_cm: 90.5 })).toEqual({
      id: 'a', loggedOn: '2026-10-27', weightKg: 72.5, waistCm: null, chestCm: 90.5, hipsCm: null, armCm: null, thighCm: null,
    })
  })
  it('maps a session row and survives a malformed exercises column', () => {
    const row = {
      id: 's', program_name: 'Push', day_label: 'D1', started_at: '2026-10-27T10:00:00Z', duration_seconds: 60,
      completed_sets: 1, total_sets: 2, volume_kg: '480.0',
      exercises: [{ name: 'Squat', sets: [{ reps: 8, weightKg: 60, done: true }] }, 'junk'],
    }
    const s = mapSessionRow(row)
    expect(s.volumeKg).toBe(480)
    expect(s.exercises).toEqual([{ name: 'Squat', sets: [{ reps: 8, weightKg: 60, done: true }] }])
    expect(mapSessionRow({ ...row, exercises: null }).exercises).toEqual([])
  })
})

describe('buildLastWeights', () => {
  const ex = (name: string, sets: [number | null, boolean][]): SessionExerciseRecord => ({
    name, sets: sets.map(([w, done]) => ({ reps: 5, weightKg: w, done })),
  })
  it('the most recent session wins', () => {
    const r = buildLastWeights([{ exercises: [ex('Squat', [[100, true]])] }, { exercises: [ex('Squat', [[80, true]])] }])
    expect(r.squat).toEqual([100])
  })
  it('only counts done sets and keeps set positions', () => {
    const r = buildLastWeights([{ exercises: [ex('Row', [[40, true], [45, false], [null, true]])] }])
    expect(r.row).toEqual([40, null, null])
  })
  it('normalises names across sessions', () => {
    const r = buildLastWeights([{ exercises: [ex('  BENCH press ', [[60, true]])] }])
    expect(r['bench press']).toEqual([60])
  })
  it('falls back to an older session when the newest did none of it', () => {
    const r = buildLastWeights([{ exercises: [ex('Curl', [[20, false]])] }, { exercises: [ex('curl', [[15, true]])] }])
    expect(r.curl).toEqual([15])
  })
  it('returns {} for no sessions', () => {
    expect(buildLastWeights([])).toEqual({})
  })
})

describe('progress schema is member-read-only and tenant-checked', () => {
  const root = process.cwd()
  const read = (p: string) => readFileSync(join(root, p), 'utf8')
  const files = {
    migration: read('supabase/migrations/20261028150000_member_progress.sql'),
    schema: read('supabase-schema.sql'),
  }
  const tables = ['member_body_logs', 'member_workout_sessions']
  const fns = [
    'save_body_log(DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC)',
    'delete_body_log(UUID)',
    'save_workout_session(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, JSONB)',
  ]

  for (const [label, sql] of Object.entries(files)) {
    describe(label, () => {
      for (const t of tables) {
        it(`${t}: RLS on, SELECT policies only, authenticated select grant, composite FK`, () => {
          expect(sql).toMatch(new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`))
          const policies = [...sql.matchAll(new RegExp(`CREATE POLICY "[^"]+"\\s+ON public\\.${t} FOR (\\w+)`, 'g'))]
          expect(policies.length).toBe(2)
          for (const p of policies) expect(p[1]).toBe('SELECT')
          expect(sql).toContain(`REVOKE ALL ON public.${t}`)
          expect(sql).toMatch(new RegExp(`GRANT SELECT ON public\\.${t}\\s+TO authenticated;`))
          expect(sql).not.toMatch(new RegExp(`GRANT [^;]*(INSERT|UPDATE|DELETE)[^;]*ON public\\.${t}`))
          expect(sql).toContain(`fk_${t}_member_same_gym`)
        })
      }
      it('RPCs are SECURITY DEFINER, search_path empty, derive the caller from auth.uid()', () => {
        for (const name of ['save_body_log', 'delete_body_log', 'save_workout_session']) {
          const start = sql.indexOf(`CREATE FUNCTION public.${name}(`)
          expect(start).toBeGreaterThan(-1)
          const body = sql.slice(start, sql.indexOf('$$;', sql.indexOf('AS $$', start)))
          expect(body).toContain('SECURITY DEFINER')
          expect(body).toContain("SET search_path = ''")
          expect(body).toContain('m.auth_user_id = auth.uid()')
          expect(body).not.toMatch(/p_(member|gym)_id/)
        }
      })
      it('RPCs are granted to authenticated only', () => {
        for (const f of fns) {
          expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon;`)
          expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${f} TO authenticated;`)
        }
      })
      it('writes refuse blocked plans', () => {
        expect(sql).toContain('MEMBER_APP_BLOCKED')
      })
    })
  }
})
