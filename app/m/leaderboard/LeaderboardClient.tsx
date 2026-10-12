'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Crown, EyeOff, Gift, Medal, RefreshCw, Target, Trophy, type LucideIcon } from 'lucide-react'
import { StreakBadge } from '@/components/member/StreakBadge'
import { useLeaderboard } from '@/lib/hooks/useLeaderboard'
import { LEADERBOARD_BOARDS, LEADERBOARD_BOARD_LABELS } from '@/lib/gamification/constants'
import { formatBoardValue, motivationLine, rankedRows } from '@/lib/gamification/leaderboardDisplay'
import type { LeaderboardBoard, LeaderboardRow } from '@/lib/gamification/types'

/**
 * Member leaderboard: four boards, live.
 *
 * The first board is rendered from server rows; after that `useLeaderboard`
 * polls a small JSON route, so a check-in at the kiosk moves the ranking here
 * within one poll without re-running the whole page.
 *
 * Other members arrive already masked ("Akhil P.") and without ids: the RPC
 * does that, so nothing sensitive reaches this component to begin with. That is
 * also why rows are keyed by position, not by member id.
 */

interface Props {
  initialBoard: LeaderboardBoard
  initialRows: LeaderboardRow[]
  /** The gym's switch. Off means the RPC returns no rows to members at all. */
  leaderboardsEnabled: boolean
  /** The member's own opt-out (Profile). They still see their own row. */
  showOnLeaderboard: boolean
  weeklyPrize: string | null
  monthlyPrize: string | null
}

/**
 * Past this many rows the member's own row has probably scrolled off a phone
 * screen, so it is repeated in a bar pinned above the bottom nav.
 */
const PIN_OWN_ROW_AFTER = 5

const PODIUM_SIZE = 3

export default function LeaderboardClient({
  initialBoard,
  initialRows,
  leaderboardsEnabled,
  showOnLeaderboard,
  weeklyPrize,
  monthlyPrize,
}: Props) {
  const [board, setBoard] = useState<LeaderboardBoard>(initialBoard)

  const { rows, loading, error, refresh } = useLeaderboard(board, {
    initialRows,
    // Nothing to poll for when the gym has the feature off.
    enabled: leaderboardsEnabled,
  })

  const view = useMemo(() => {
    const ranked = rankedRows(rows)
    const me = rows.find(r => r.isMe) ?? null
    const hasPodium = ranked.length >= PODIUM_SIZE
    const podium = hasPodium ? ranked.slice(0, PODIUM_SIZE) : []
    const list = hasPodium ? ranked.slice(PODIUM_SIZE) : ranked
    // The RPC always returns the caller, even with nothing to rank; show that
    // row last and unranked so the member can see where they will appear.
    const unrankedMe = me && me.value <= 0 ? me : null
    const myIndex = me ? ranked.indexOf(me) : -1
    return { ranked, me, podium, list, unrankedMe, pinMe: myIndex >= PIN_OWN_ROW_AFTER }
  }, [rows])

  const line = useMemo(() => motivationLine(board, rows), [board, rows])
  const prize = board === 'week' ? weeklyPrize : board === 'month' ? monthlyPrize : null

  return (
    <div className="page-container py-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Leaderboard</h1>
          <p className="mt-0.5 text-xs font-medium text-slate-400">See how you rank at your gym</p>
        </div>
        {leaderboardsEnabled && (
          <span className="mt-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        )}
      </header>

      {!leaderboardsEnabled ? (
        <EmptyState
          icon={Trophy}
          title="Leaderboards are switched off"
          body="Your gym has turned leaderboards off for now. Your streak, XP and badges still count."
        >
          <Link href="/m/rewards" prefetch className="btn-secondary mt-4 !w-auto px-5">
            View my rewards
          </Link>
        </EmptyState>
      ) : (
        <>
          {/* Boards */}
          <div
            role="tablist"
            aria-label="Leaderboard"
            className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {LEADERBOARD_BOARDS.map((id) => {
              const active = id === board
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`board-tab-${id}`}
                  aria-selected={active}
                  aria-controls="board-panel"
                  onClick={() => setBoard(id)}
                  className={`min-h-11 rounded-lg px-1 text-[11px] font-bold leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    active ? 'bg-surface text-brand-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {LEADERBOARD_BOARD_LABELS[id]}
                </button>
              )
            })}
          </div>

          <div id="board-panel" role="tabpanel" aria-labelledby={`board-tab-${board}`}>
            {!showOnLeaderboard && (
              <div className="mb-3 flex items-start gap-3 rounded-2xl border border-slate-200 bg-surface-secondary p-3.5">
                <EyeOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <p className="text-xs leading-relaxed text-slate-600">
                  You are hidden from this leaderboard. Other members cannot see you; only you can see your own row.{' '}
                  <Link href="/m/profile" prefetch className="font-bold text-brand-600 underline underline-offset-2">
                    Change this in Profile
                  </Link>
                </p>
              </div>
            )}

            {line && (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-600">
                  <Target aria-hidden="true" className="h-4 w-4" />
                </span>
                {/* polite: a poll that changes the ranking is announced, without interrupting. */}
                <p aria-live="polite" className="text-sm font-bold leading-snug text-slate-900">{line}</p>
              </div>
            )}

            {prize && (
              <div className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
                <Gift aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
                    {board === 'week' ? 'Weekly prize' : 'Monthly prize'}
                  </p>
                  <p className="mt-0.5 break-words text-sm font-semibold text-slate-800">{prize}</p>
                </div>
              </div>
            )}

            {error && rows.length > 0 && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-1">
                <p className="text-xs font-semibold text-amber-700">Could not refresh. Showing the last result.</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="tap-target inline-flex shrink-0 items-center justify-center gap-1 text-xs font-bold text-amber-700"
                >
                  <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            )}

            {loading ? (
              <BoardSkeleton />
            ) : error && rows.length === 0 ? (
              <EmptyState icon={RefreshCw} title="Could not load the leaderboard" body={error}>
                <button type="button" onClick={refresh} className="btn-secondary mt-4 !w-auto px-5">
                  Try again
                </button>
              </EmptyState>
            ) : view.ranked.length === 0 ? (
              <>
                <EmptyState
                  icon={Trophy}
                  title="No one is on this board yet"
                  body="The first check-in takes the top spot. It could be yours."
                />
                {view.unrankedMe && (
                  <ol className="mt-3">
                    <BoardRow row={view.unrankedMe} board={board} />
                  </ol>
                )}
              </>
            ) : (
              <>
                {view.podium.length > 0 && <Podium rows={view.podium} board={board} />}

                <ol className="space-y-2">
                  {view.list.map((row, i) => (
                    <BoardRow key={`${row.rank}-${i}`} row={row} board={board} />
                  ))}
                  {view.unrankedMe && <BoardRow row={view.unrankedMe} board={board} />}
                </ol>

                {view.pinMe && view.me && (
                  // Sticks just above the fixed bottom nav while the list scrolls under it.
                  <div className="sticky bottom-[calc(var(--bottom-nav-height)+var(--pwa-safe-bottom)+0.5rem)] z-10 mt-3">
                    <ol aria-label="Your position" className="rounded-2xl bg-surface shadow-lg">
                      <BoardRow row={view.me} board={board} />
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function YouPill() {
  return (
    <span className="shrink-0 rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
      You
    </span>
  )
}

/** The board's value for one row. On the streak board it carries the pending state. */
function RowValue({ row, board }: { row: LeaderboardRow; board: LeaderboardBoard }) {
  if (board === 'streak') {
    return (
      <StreakBadge
        streak={row.value}
        pending={row.streakPending}
        size="sm"
        valueText={formatBoardValue('streak', row.value)}
      />
    )
  }
  return (
    <span className="text-xs font-bold tabular-nums text-slate-900">{formatBoardValue(board, row.value)}</span>
  )
}

function BoardRow({ row, board }: { row: LeaderboardRow; board: LeaderboardBoard }) {
  const ranked = row.value > 0
  return (
    <li
      aria-current={row.isMe ? 'true' : undefined}
      className={`flex items-center gap-3 rounded-2xl border p-3 ${
        row.isMe ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-surface'
      }`}
    >
      <span
        className={`w-7 shrink-0 text-center text-sm font-black tabular-nums ${row.isMe ? 'text-brand-600' : 'text-slate-400'}`}
      >
        <span className="sr-only">{ranked ? 'Rank ' : 'Not ranked yet'}</span>
        {ranked ? row.rank : <span aria-hidden="true">–</span>}
      </span>

      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          row.isMe ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {Array.from(row.displayName.trim())[0]?.toUpperCase() ?? '?'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-slate-900">{row.displayName || 'Member'}</span>
          {row.isMe && <YouPill />}
        </p>
        {/* The streak board already shows the streak as its value. */}
        {row.isMe && board !== 'streak' && (
          <StreakBadge streak={row.streak} pending={row.streakPending} size="sm" suffix="day streak" className="mt-0.5" />
        )}
      </div>

      <span className="shrink-0 text-right">
        <RowValue row={row} board={board} />
      </span>
    </li>
  )
}

const PODIUM_STYLES = [
  { order: 'order-2', padding: 'pt-5 pb-4', icon: 'h-7 w-7 text-amber-400', plate: 'border-amber-200 bg-amber-50' },
  { order: 'order-1', padding: 'pt-4 pb-3', icon: 'h-5 w-5 text-slate-400', plate: 'border-slate-200 bg-surface' },
  { order: 'order-3', padding: 'pt-3 pb-3', icon: 'h-5 w-5 text-orange-400', plate: 'border-orange-200 bg-orange-50' },
] as const

/**
 * Top three, drawn 2-1-3 so first place stands in the middle and tallest.
 * That is visual order only (`order-*`): the DOM stays 1-2-3 so a screen reader
 * hears the leader first.
 */
function Podium({ rows, board }: { rows: LeaderboardRow[]; board: LeaderboardBoard }) {
  return (
    <ol aria-label="Top three" className="mb-4 grid grid-cols-3 items-end gap-2">
      {rows.map((row, i) => {
        const style = PODIUM_STYLES[i]
        const Icon = i === 0 ? Crown : Medal
        return (
          <li
            key={`${row.rank}-${i}`}
            aria-current={row.isMe ? 'true' : undefined}
            className={`${style.order} ${style.padding} flex min-w-0 flex-col items-center rounded-2xl border px-2 text-center ${
              row.isMe ? 'border-brand-200 bg-brand-50 ring-2 ring-brand-400' : style.plate
            }`}
          >
            <Icon aria-hidden="true" className={style.icon} />
            {/* The RPC's rank, not the slot: two members can share #1. */}
            <span className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">#{row.rank}</span>
            <span className="mt-1 w-full truncate text-xs font-bold text-slate-900">{row.displayName || 'Member'}</span>
            {row.isMe && <span className="mt-1 inline-flex"><YouPill /></span>}
            <span className="mt-1.5 flex justify-center">
              <RowValue row={row} board={board} />
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="card flex flex-col items-center rounded-2xl px-5 py-10 text-center">
      <Icon aria-hidden="true" className="mb-3 h-10 w-10 text-slate-300" />
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
      {children}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
