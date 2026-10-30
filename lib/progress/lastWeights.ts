import { normaliseExerciseName, type LastWeights, type SessionExerciseRecord } from '@/types/progress'

/**
 * Sessions must be newest first. For each exercise (keyed by normalised name) the first session that did
 * it wins; its per-set weights are kept at their set index, counting only sets marked done (others are
 * null). A session where the exercise has no completed set does not claim the name, so an older one can.
 */
export function buildLastWeights(sessions: { exercises: SessionExerciseRecord[] }[]): LastWeights {
  const out: LastWeights = {}
  for (const session of sessions) {
    for (const ex of session.exercises) {
      const key = normaliseExerciseName(ex.name)
      if (!key || key in out) continue
      if (!ex.sets.some((s) => s.done)) continue
      out[key] = ex.sets.map((s) => (s.done ? s.weightKg : null))
    }
  }
  return out
}
