'use client'

/**
 * features/member-app/components/GamificationBoards.tsx
 *
 * The live parts of the Gamification tab: the leaderboard preview and the
 * "Current leaders" prize section. Both are presentational; the panel owns the
 * polling hooks and the award actions, so the week and month boards are fetched
 * once and shared by the table and the leaders list.
 */

import { useState } from 'react'
import { Award, Check, Crown, Hourglass, RefreshCw, Trophy, Undo2 } from 'lucide-react'
import { LEADERBOARD_BOARDS, LEADERBOARD_BOARD_LABELS } from '@/lib/gamification/constants'
import type { GamificationSettings, LeaderboardBoard, LeaderboardRow } from '@/lib/gamification/types'
import type { GamificationAward } from '@/types/member-app'
import {
  OWNER_BOARD_PREVIEW,
  PRIZE_BOARDS,
  findAward,
  awardDay,
  findOverlappingAward,
  formatBoardValue,
  formatPeriodLabel,
  pickLeaders,
  prizeFor,
  type PrizeBoard,
} from '../utils/gamificationConfig'
import { Card, EmptyState, SectionHeader } from './ui'

export interface BoardState {
  rows: LeaderboardRow[]
  loading: boolean
  error: string | null
  refresh: () => void
}

// ─── Leaderboard preview ─────────────────────────────────────────────────────

/**
 * Header of the board's own ranking column. Only the two check-in boards get
 * one: on Streaks and All-time XP the ranking value IS the Streak / XP column,
 * so a third column would just repeat a number already on the row.
 */
const VALUE_HEADER: Partial<Record<LeaderboardBoard, string>> = {
  week: 'Check-ins',
  month: 'Check-ins',
}

const numberCell = 'py-3 px-3 text-right tabular-nums align-middle'
const headCell = 'font-semibold text-slate-500 text-xs uppercase tracking-wide pb-3 px-3'

export function LeaderboardPreview({
  board,
  onBoardChange,
  state,
}: {
  board: LeaderboardBoard
  onBoardChange: (board: LeaderboardBoard) => void
  state: BoardState
}) {
  const [expanded, setExpanded] = useState(false)
  const { rows, loading, error, refresh } = state

  const visible = expanded ? rows : rows.slice(0, OWNER_BOARD_PREVIEW)
  const valueHeader = VALUE_HEADER[board]
  const totalMembers = rows[0]?.totalMembers ?? rows.length
  // Bold marks the column this board is ranked by.
  const rankedBy = (column: 'value' | 'xp' | 'streak') =>
    (board === 'all' && column === 'xp') || (board === 'streak' && column === 'streak') || column === 'value'
      ? 'font-bold text-slate-900'
      : 'text-slate-600'

  return (
    <Card>
      <SectionHeader
        title="Leaderboard"
        description="Your members ranked live. Updates on its own as people check in."
      />

      <div className="overflow-x-auto -mx-6 px-6 mb-4">
        <div role="tablist" aria-label="Leaderboard" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 min-w-max">
          {LEADERBOARD_BOARDS.map(id => {
            const active = id === board
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`board-tab-${id}`}
                aria-selected={active}
                aria-controls="board-panel"
                onClick={() => {
                  setExpanded(false)
                  onBoardChange(id)
                }}
                className={`min-h-[36px] rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                  active ? 'bg-surface text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {LEADERBOARD_BOARD_LABELS[id]}
              </button>
            )
          })}
        </div>
      </div>

      <div role="tabpanel" id="board-panel" aria-labelledby={`board-tab-${board}`}>
        {error && (
          <div className="flex items-center justify-between gap-3 mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
            <p role="status" className="text-xs font-medium text-amber-800">
              {rows.length > 0 ? `${error} Showing the last result.` : error}
            </p>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex flex-shrink-0 items-center gap-1 min-h-[32px] px-2 rounded-lg text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div aria-busy="true" aria-label="Loading leaderboard" className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          !error && (
            <EmptyState
              icon={<Trophy className="w-5 h-5" />}
              title="No leaderboard data yet"
              message="Rankings appear once members start checking in."
            />
          )
        ) : (
          <>
            {/* Own wrapper instead of ui.tsx TableWrap: that one forces 720px,
                which is three phone widths for a five-column table. */}
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm min-w-[380px]">
                <thead>
                  <tr>
                    <th scope="col" className={`${headCell} text-left w-14`}>Rank</th>
                    <th scope="col" className={`${headCell} text-left`}>Member</th>
                    {valueHeader && <th scope="col" className={`${headCell} text-right`}>{valueHeader}</th>}
                    <th scope="col" className={`${headCell} text-right`}>XP</th>
                    <th scope="col" className={`${headCell} text-right`}>Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, index) => (
                    <tr
                      key={row.memberId ?? `${row.rank}-${index}`}
                      className="border-b border-surface-border last:border-b-0"
                    >
                      <td className="py-3 px-3 align-middle">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                            row.rank === 1 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.rank}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-middle font-semibold text-slate-900 max-w-[160px] truncate">
                        {row.displayName || 'Member'}
                      </td>
                      {valueHeader && (
                        <td className={`${numberCell} ${rankedBy('value')}`}>{row.value.toLocaleString('en-IN')}</td>
                      )}
                      <td className={`${numberCell} ${rankedBy('xp')}`}>{row.xp.toLocaleString('en-IN')}</td>
                      <td className={`${numberCell} ${rankedBy('streak')}`}>
                        <span className="inline-flex items-center justify-end gap-1">
                          {/* The number counts attended days only. The hourglass
                              says today's check-in is still missing; it is never
                              added to the count in advance. */}
                          {row.streakPending && (
                            <Hourglass
                              role="img"
                              aria-label="Has not checked in today"
                              className="w-3.5 h-3.5 text-amber-500"
                            />
                          )}
                          {row.streak}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
              <p className="text-xs text-slate-500">
                Showing {visible.length} of {totalMembers.toLocaleString('en-IN')}{' '}
                {totalMembers === 1 ? 'member' : 'members'}
                {rows.some(r => r.streakPending) && (
                  <span className="inline-flex items-center gap-1 ml-2">
                    <Hourglass aria-hidden="true" className="w-3 h-3 text-amber-500" />
                    not checked in today
                  </span>
                )}
              </p>
              {rows.length > OWNER_BOARD_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setExpanded(v => !v)}
                  aria-expanded={expanded}
                  className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
                >
                  {expanded ? 'Show fewer' : `Show more (top ${rows.length})`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

// ─── Current leaders + prizes ────────────────────────────────────────────────

const LEADER_TITLES: Record<PrizeBoard, string> = {
  week: 'Last 7 days',
  month: 'Last 30 days',
}

export function CurrentLeaders({
  boards,
  settings,
  awards,
  periods,
  pendingKey,
  onAward,
  onUndo,
  onEditPrizes,
}: {
  boards: Record<PrizeBoard, BoardState>
  settings: GamificationSettings
  awards: GamificationAward[]
  periods: Record<PrizeBoard, string>
  /** Key of the award action in flight (`award:<board>:<memberId>` / `undo:<awardId>`), or null. */
  pendingKey: string | null
  onAward: (board: PrizeBoard, memberId: string) => void
  onUndo: (awardId: string) => void
  onEditPrizes: () => void
}) {
  const recent = awards.slice(0, 5)

  return (
    <Card>
      <SectionHeader
        title="Current leaders"
        description="Who is in first place right now, and the prize you have set for them."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PRIZE_BOARDS.map(board => {
          const state = boards[board]
          const leaders = pickLeaders(state.rows)
          const prize = prizeFor(settings, board)

          return (
            <section
              key={board}
              aria-label={`${LEADER_TITLES[board]} leader`}
              className="p-4 bg-surface-secondary rounded-xl border border-surface-border flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <Crown className="w-3.5 h-3.5" />
                </div>
                <p className="text-sm font-bold text-slate-900">{LEADER_TITLES[board]}</p>
              </div>

              <div className="text-xs">
                <span className="font-semibold text-slate-500">Prize: </span>
                {prize ? (
                  <span className="text-slate-800 break-words">{prize}</span>
                ) : (
                  <>
                    <span className="text-slate-500">none set. </span>
                    <button
                      type="button"
                      onClick={onEditPrizes}
                      className="font-semibold text-brand-600 hover:text-brand-700 underline underline-offset-2"
                    >
                      Add a prize
                    </button>
                  </>
                )}
              </div>

              {state.loading ? (
                <div aria-busy="true" aria-label="Loading leader" className="h-12 rounded-lg bg-slate-100 animate-pulse" />
              ) : leaders.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {state.error && state.rows.length === 0
                    ? 'Could not load the leader right now.'
                    : `No check-ins in the ${LEADER_TITLES[board].toLowerCase()} yet.`}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {leaders.map(leader => {
                    // pickLeaders only returns rows with a member id.
                    const memberId = leader.memberId as string
                    const award = findAward(awards, board, memberId, periods[board])
                    const earlier = award ? undefined : findOverlappingAward(awards, board, memberId, periods[board])
                    const awarding = pendingKey === `award:${board}:${memberId}`
                    const undoing = award ? pendingKey === `undo:${award.id}` : false

                    return (
                      <li key={memberId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{leader.displayName || 'Member'}</p>
                          <p className="text-xs text-slate-500">{formatBoardValue(board, leader.value)}</p>
                          {earlier && (
                            <p className="text-xs text-amber-700 mt-0.5">
                              Already awarded{awardDay(earlier.awardedAt) ? ` on ${awardDay(earlier.awardedAt)}` : ' recently'}
                            </p>
                          )}
                        </div>

                        {award ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-semibold">
                              <Check className="w-3.5 h-3.5" />
                              Awarded
                            </span>
                            <button
                              type="button"
                              onClick={() => onUndo(award.id)}
                              disabled={pendingKey !== null}
                              aria-label={`Undo prize awarded to ${leader.displayName}`}
                              className="inline-flex items-center gap-1 min-h-[36px] px-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              {undoing ? 'Undoing...' : 'Undo'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAward(board, memberId)}
                            disabled={!prize || pendingKey !== null}
                            aria-describedby={!prize ? `no-prize-${board}` : undefined}
                            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors disabled:opacity-50"
                          >
                            <Award className="w-3.5 h-3.5" />
                            {awarding ? 'Saving...' : 'Mark prize awarded'}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {!prize && leaders.length > 0 && (
                <p id={`no-prize-${board}`} className="text-xs text-slate-500">
                  Set a prize in Achievement Config to mark it as awarded.
                </p>
              )}
            </section>
          )
        })}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Recently awarded</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No prizes marked as awarded yet.</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {recent.map(award => (
              <li key={award.id} className="flex items-start gap-3 py-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Award className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">
                    <span className="font-semibold">{award.memberName}</span>
                    <span className="text-slate-500"> won </span>
                    <span className="break-words">{award.prize}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {LEADERBOARD_BOARD_LABELS[award.board]}
                    {award.periodLabel ? ` (${formatPeriodLabel(award.periodLabel)})` : ''}
                    {awardDay(award.awardedAt) ? ` · marked ${awardDay(award.awardedAt)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
