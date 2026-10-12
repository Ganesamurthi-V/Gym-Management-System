/**
 * `get_gym_leaderboard` RPC rows -> `LeaderboardRow`.
 *
 * The mapper is defensive on purpose: the RPC result is untyped at the Supabase
 * client, and a board is polled, so a malformed row should be dropped rather
 * than crash a page that will refetch in a few seconds anyway.
 */

import { LEADERBOARD_BOARDS, MAX_LEADERBOARD_LIMIT, DEFAULT_LEADERBOARD_LIMIT } from './constants'
import type { LeaderboardBoard, LeaderboardRow } from './types'

/** One row exactly as the RPC returns it. */
export interface LeaderboardRpcRow {
  member_id: string | null
  display_name: string
  rank: number
  value: number
  xp: number
  streak: number
  streak_pending: boolean
  days_last_7: number
  days_last_30: number
  is_me: boolean
  total_members: number
  total_days: number
}

/** Arguments of the RPC: `supabase.rpc('get_gym_leaderboard', leaderboardRpcArgs(board, limit))`. */
export interface LeaderboardRpcArgs {
  p_board: LeaderboardBoard
  p_limit: number
}

function int(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function isLeaderboardBoard(value: unknown): value is LeaderboardBoard {
  return typeof value === 'string' && (LEADERBOARD_BOARDS as readonly string[]).includes(value)
}

/** Unknown / missing input falls back to the default board instead of erroring in the RPC. */
export function parseLeaderboardBoard(value: unknown, fallback: LeaderboardBoard = 'week'): LeaderboardBoard {
  return isLeaderboardBoard(value) ? value : fallback
}

export function leaderboardRpcArgs(
  board: LeaderboardBoard,
  limit: number = DEFAULT_LEADERBOARD_LIMIT,
): LeaderboardRpcArgs {
  const safe = Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LEADERBOARD_LIMIT
  return { p_board: board, p_limit: Math.min(Math.max(safe, 1), MAX_LEADERBOARD_LIMIT) }
}

export function mapLeaderboardRow(row: unknown): LeaderboardRow | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Partial<Record<keyof LeaderboardRpcRow, unknown>>
  return {
    memberId: typeof r.member_id === 'string' ? r.member_id : null,
    displayName: typeof r.display_name === 'string' ? r.display_name : '',
    rank: int(r.rank),
    value: int(r.value),
    xp: int(r.xp),
    streak: int(r.streak),
    streakPending: r.streak_pending === true,
    daysLast7: int(r.days_last_7),
    daysLast30: int(r.days_last_30),
    isMe: r.is_me === true,
    totalMembers: int(r.total_members),
    totalDays: int(r.total_days),
  }
}

/** RPC `data` (array, null on error) -> rows in the order the RPC returned them (by position). */
export function mapLeaderboard(data: unknown): LeaderboardRow[] {
  if (!Array.isArray(data)) return []
  const rows: LeaderboardRow[] = []
  for (const raw of data) {
    const row = mapLeaderboardRow(raw)
    if (row) rows.push(row)
  }
  return rows
}
