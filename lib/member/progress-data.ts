import 'server-only'
import { cache } from 'react'
import { getServerClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { buildLastWeights } from '@/lib/progress/lastWeights'
import { mapBodyLogRow, mapExercises, mapSessionRow } from '@/lib/progress/validate'
import { BODY_GOALS, type BodyGoal, type BodyLog, type BodyProfile, type LastWeights, type WorkoutSessionSummary } from '@/types/progress'

// RLS scopes both tables to the signed-in member's own rows, so no member filter is needed here.
const BODY_LOG_COLUMNS = 'id, logged_on, weight_kg, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm'
const SESSION_COLUMNS =
  'id, program_name, day_label, started_at, duration_seconds, completed_sets, total_sets, volume_kg, exercises'

/** Newest first, at most 120 entries. Throws on a query error so the page shows the real failure. */
export const getBodyLogs = cache(async (): Promise<BodyLog[]> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('member_body_logs')
    .select(BODY_LOG_COLUMNS)
    .order('logged_on', { ascending: false })
    .limit(120)
  if (error) throw new Error(`getBodyLogs failed: ${error.message}`)
  return (data ?? []).map((r) => mapBodyLogRow(r as Record<string, unknown>))
})

/** The member's height and goal, or null before the baseline is saved. Throws on a query error. */
export const getBodyProfile = cache(async (): Promise<BodyProfile | null> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('member_body_profile')
    .select('height_cm, goal, target_weight_kg, target_date')
    .maybeSingle()
  if (error) throw new Error(`getBodyProfile failed: ${error.message}`)
  if (!data) return null
  const row = data as { height_cm: unknown; goal: unknown; target_weight_kg: unknown; target_date: unknown }
  const heightCm = Number(row.height_cm)
  if (!Number.isFinite(heightCm) || !BODY_GOALS.includes(row.goal as BodyGoal)) return null
  const targetKg = row.target_weight_kg == null ? NaN : Number(row.target_weight_kg)
  const hasTarget = Number.isFinite(targetKg) && typeof row.target_date === 'string'
  return {
    heightCm,
    goal: row.goal as BodyGoal,
    targetWeightKg: hasTarget ? targetKg : null,
    targetDate: hasTarget ? (row.target_date as string) : null,
  }
})

/** Newest first. Throws on a query error. */
export const getRecentSessions = cache(async (limit = 20): Promise<WorkoutSessionSummary[]> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('member_workout_sessions')
    .select(SESSION_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`getRecentSessions failed: ${error.message}`)
  return (data ?? []).map((r) => mapSessionRow(r as Record<string, unknown>))
})

/** Never throws: the workout screen must work without pre-filled weights. */
export const getLastWeights = cache(async (): Promise<LastWeights> => {
  try {
    const supabase = await getServerClient()
    const { data, error } = await supabase
      .from('member_workout_sessions')
      .select('exercises')
      .order('started_at', { ascending: false })
      .limit(30)
    if (error) {
      logger.error('get_last_weights_failed', { error: error.message })
      return {}
    }
    return buildLastWeights((data ?? []).map((r) => ({ exercises: mapExercises((r as { exercises: unknown }).exercises) })))
  } catch (err) {
    logger.error('get_last_weights_failed', { error: err instanceof Error ? err.message : String(err) })
    return {}
  }
})
