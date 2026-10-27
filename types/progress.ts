/**
 * Member body progress and workout history. Tables: member_body_logs, member_workout_sessions.
 * All dates are India dates (YYYY-MM-DD). Weights are kilograms, lengths centimetres.
 */

export interface BodyLog {
  id: string
  loggedOn: string
  weightKg: number | null
  waistCm: number | null
  chestCm: number | null
  hipsCm: number | null
  armCm: number | null
  thighCm: number | null
}

export interface SessionSetRecord {
  reps: number | null
  weightKg: number | null
  done: boolean
}

export interface SessionExerciseRecord {
  name: string
  sets: SessionSetRecord[]
}

export interface WorkoutSessionSummary {
  id: string
  programName: string
  dayLabel: string
  /** ISO timestamp the session started. */
  startedAt: string
  durationSeconds: number
  completedSets: number
  totalSets: number
  /** Sum of reps x weight over completed sets. */
  volumeKg: number
  exercises: SessionExerciseRecord[]
}

/** Normalised exercise name (trimmed, lower case) -> weight per set index from the member's latest session with it. */
export type LastWeights = Record<string, (number | null)[]>

export const PROGRESS_LIMITS = {
  weightMin: 20,
  weightMax: 300,
  lengthMin: 10,
  lengthMax: 250,
  liftMax: 500,
  maxExercises: 30,
  maxSets: 20,
} as const

export function normaliseExerciseName(name: string): string {
  return name.trim().toLowerCase()
}
