import { z } from 'zod'
import {
  BODY_GOALS,
  PROGRESS_LIMITS,
  type BodyLog,
  type SessionExerciseRecord,
  type WorkoutSessionSummary,
} from '@/types/progress'

const L = PROGRESS_LIMITS

/** Numbers may arrive as numbers or numeric strings; '', null and undefined all mean "not given". */
const toNumber = (v: unknown): unknown => {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' ? null : Number(t)
  }
  return v
}

const bounded = (min: number, max: number) =>
  z.preprocess(toNumber, z.number().finite().min(min).max(max).nullable())

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date')

/** Body of POST /api/member/body-logs. The database also refuses future / older-than-a-year dates. */
export const bodyLogSchema = z
  .object({
    logged_on: z.preprocess((v) => (v === '' || v === null ? undefined : v), dateOnly.optional()),
    weight_kg: bounded(L.weightMin, L.weightMax),
    waist_cm: bounded(L.lengthMin, L.lengthMax),
    chest_cm: bounded(L.lengthMin, L.lengthMax),
    hips_cm: bounded(L.lengthMin, L.lengthMax),
    arm_cm: bounded(L.lengthMin, L.lengthMax),
    thigh_cm: bounded(L.lengthMin, L.lengthMax),
  })
  .refine(
    (b) => [b.weight_kg, b.waist_cm, b.chest_cm, b.hips_cm, b.arm_cm, b.thigh_cm].some((x) => x !== null),
    { message: 'Enter at least one measurement' },
  )

/** Body of POST /api/member/body-profile. */
export const bodyProfileSchema = z
  .object({
    height_cm: z.preprocess(toNumber, z.number().finite().min(100).max(230)),
    goal: z.enum(BODY_GOALS),
    target_weight_kg: bounded(L.weightMin, L.weightMax).optional(),
    target_date: z.preprocess((v) => (v === '' || v === null ? undefined : v), dateOnly.optional()),
  })
  .refine((b) => (b.target_weight_kg == null) === (b.target_date == null), {
    message: 'Enter both a target weight and a target date',
  })

export type BodyLogInput = z.infer<typeof bodyLogSchema>

const setSchema = z.object({
  reps: z.preprocess(toNumber, z.number().int().min(0).max(1000).nullable()),
  weight_kg: bounded(0, L.liftMax),
  done: z.boolean().default(false),
})

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sets: z.array(setSchema).min(1).max(L.maxSets),
})

/** Body of POST /api/member/workout-sessions. Totals are computed by the database, never sent. */
export const workoutSessionSchema = z.object({
  client_id: z.string().uuid(),
  program_name: z.string().trim().max(100).default(''),
  day_label: z.string().trim().max(100).default(''),
  started_at: z.string().datetime({ offset: true }),
  duration_seconds: z.preprocess(toNumber, z.number().int().min(0).max(86400)),
  exercises: z.array(exerciseSchema).min(1).max(L.maxExercises),
})

export type WorkoutSessionInput = z.infer<typeof workoutSessionSchema>

// Row mappers

/** PostgREST can return numeric columns as strings; accept both. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function mapBodyLogRow(row: Record<string, unknown>): BodyLog {
  return {
    id: String(row.id),
    loggedOn: String(row.logged_on),
    weightKg: num(row.weight_kg),
    waistCm: num(row.waist_cm),
    chestCm: num(row.chest_cm),
    hipsCm: num(row.hips_cm),
    armCm: num(row.arm_cm),
    thighCm: num(row.thigh_cm),
  }
}

/** Defensive: the stored jsonb is built by save_workout_session, but a bad row must not break the page. */
export function mapExercises(raw: unknown): SessionExerciseRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((e): SessionExerciseRecord[] => {
    if (!e || typeof e !== 'object') return []
    const ex = e as { name?: unknown; sets?: unknown }
    if (typeof ex.name !== 'string' || !Array.isArray(ex.sets)) return []
    const sets = ex.sets.map((s) => {
      const r = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
      return {
        reps: num(r.reps),
        weightKg: num(r.weightKg ?? r.weight_kg),
        done: r.done === true,
      }
    })
    return [{ name: ex.name, sets }]
  })
}

export function mapSessionRow(row: Record<string, unknown>): WorkoutSessionSummary {
  return {
    id: String(row.id),
    programName: typeof row.program_name === 'string' ? row.program_name : '',
    dayLabel: typeof row.day_label === 'string' ? row.day_label : '',
    startedAt: String(row.started_at),
    durationSeconds: num(row.duration_seconds) ?? 0,
    completedSets: num(row.completed_sets) ?? 0,
    totalSets: num(row.total_sets) ?? 0,
    volumeKg: num(row.volume_kg) ?? 0,
    exercises: mapExercises(row.exercises),
  }
}
