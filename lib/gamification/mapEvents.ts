/**
 * Database rows / RPC JSON -> the camelCase event types in events.ts.
 * Tolerant like mapMemberGamification: bad input yields a usable empty state.
 */

import { EVENT_GOAL_TYPES, EVENT_SESSION_FILTERS } from './constants'
import type { EventGoalType, EventSessionFilter, GymEvent, MemberEvent } from './events'

/** A gym_events row exactly as PostgREST returns it. */
export interface GymEventRow {
  id: string
  title: string
  description: string | null
  goal_type: string
  goal_target: number
  min_session_minutes: number | null
  session_filter: string | null
  start_date: string
  end_date: string
  reward_xp: number
  reward_text: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** The column list the API routes select, kept in one place. */
export const GYM_EVENT_COLUMNS =
  'id, title, description, goal_type, goal_target, min_session_minutes, session_filter, start_date, end_date, reward_xp, reward_text, is_active, created_at, updated_at'

function int(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function goalType(value: unknown): EventGoalType {
  return (EVENT_GOAL_TYPES as readonly unknown[]).includes(value) ? (value as EventGoalType) : 'checkin_days'
}

function sessionFilter(value: unknown): EventSessionFilter | null {
  return (EVENT_SESSION_FILTERS as readonly unknown[]).includes(value) ? (value as EventSessionFilter) : null
}

export function mapGymEventRow(row: GymEventRow): GymEvent {
  return {
    id: row.id,
    title: row.title,
    description: text(row.description),
    goalType: goalType(row.goal_type),
    goalTarget: int(row.goal_target),
    minSessionMinutes: row.min_session_minutes == null ? null : int(row.min_session_minutes),
    sessionFilter: sessionFilter(row.session_filter),
    startDate: row.start_date,
    endDate: row.end_date,
    rewardXp: int(row.reward_xp),
    rewardText: text(row.reward_text),
    isActive: row.is_active === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** `get_member_events()` JSON -> MemberEvent[] ([] for null / malformed). */
export function mapMemberEvents(data: unknown): MemberEvent[] {
  if (!Array.isArray(data)) return []
  const out: MemberEvent[] = []
  for (const raw of data) {
    if (typeof raw !== 'object' || raw === null) continue
    const e = raw as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.startDate !== 'string' || typeof e.endDate !== 'string') continue
    out.push({
      id: e.id,
      title: typeof e.title === 'string' ? e.title : '',
      description: text(e.description),
      goalType: goalType(e.goalType),
      goalTarget: int(e.goalTarget),
      minSessionMinutes: e.minSessionMinutes == null ? null : int(e.minSessionMinutes),
      sessionFilter: sessionFilter(e.sessionFilter),
      startDate: e.startDate,
      endDate: e.endDate,
      rewardXp: int(e.rewardXp),
      rewardText: text(e.rewardText),
      progress: int(e.progress),
      completed: e.completed === true,
      completedAt: typeof e.completedAt === 'string' ? e.completedAt : null,
      rewardGiven: e.rewardGiven === true,
    })
  }
  return out
}
