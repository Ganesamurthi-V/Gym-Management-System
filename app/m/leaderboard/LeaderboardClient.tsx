'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { Crown, EyeOff, Gift, Medal, RefreshCw, Target, Trophy, type LucideIcon } from 'lucide-react'
import { FadeIn } from '@/components/ui/motion'
import { spring } from '@/lib/motion'
import { MemberTopBar } from '@/components/member/MemberTopBar'
import { SectionSwitch } from '@/components/member/SectionSwitch'
import { StreakBadge } from '@/components/member/StreakBadge'
import { useLeaderboard } from '@/lib/hooks/useLeaderboard'
import { LEADERBOARD_BOARDS, LEADERBOARD_BOARD_LABELS } from '@/lib/gamification/constants'
import { formatBoardValue, motivationLine, rankedRows } from '@/lib/gamification/leaderboardDisplay'
import { cn } from '@/lib/utils'
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
  memberName: string
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
  memberName,
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
    // Rows carry no ids (masked), so a key is the name plus an occurrence count:
    // stable across polls, which is what lets a reordered row glide instead of remount.
    const seen = new Map<string, number>()
    const keys = new Map<LeaderboardRow, string>()
    for (const r of ranked) {
      const base = `${r.isMe ? 'me' : 'm'}:${r.displayName}`
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      keys.set(r, `${base}#${n}`)
    }
    return { ranked, me, podium, list, unrankedMe, pinMe: myIndex >= PIN_OWN_ROW_AFTER, keys }
  }, [rows])

  const line = useMemo(() => motivationLine(board, rows), [board, rows])
  const reduce = useReducedMotion()
  const prize = board === 'week' ? weeklyPrize : board === 'month' ? monthlyPrize : null

  return (
    <>
      <MemberTopBar
        variant="root"
        title="Rewards"
        memberName={memberName}
        actions={
          leaderboardsEnabled ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          ) : undefined
        }
      />
      <div className="page-container pb-32 pt-2">
      {leaderboardsEnabled && (
        <SectionSwitch
          className="mb-4"
          items={[
            { href: '/m/rewards', label: 'Rewards' },
            { href: '/m/leaderboard', label: 'Leaderboard' },
          ]}
        />
      )}

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
          <LayoutGroup id="board-switcher">
            <div
              role="tablist"
              aria-label="Leaderboard"
              className="mb-4 grid grid-cols-4 gap-1 rounded-full bg-surface-secondary p-1"
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
                    className={cn(
                      'relative min-h-11 rounded-full px-1 text-[11px] font-bold leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      active ? 'text-white' : 'text-slate-500',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="board-pill"
                        transition={spring}
                        className="absolute inset-0 rounded-full bg-brand-500"
                      />
                    )}
                    <span className="relative">{LEADERBOARD_BOARD_LABELS[id]}</span>
                  </button>
                )
              })}
            </div>
          </LayoutGroup>

          <div id="board-panel" role="tabpanel" aria-labelledby={`board-tab-${board}`}>
            {!showOnLeaderboard && (
              <div className="mb-3 flex items-start gap-3 rounded-3xl border border-surface-border bg-surface-secondary p-4">
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
              <div className="mb-3 flex items-center gap-3 rounded-3xl border border-brand-200 bg-brand-50 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-surface text-brand-600">
                  <Target aria-hidden="true" className="h-4 w-4" />
                </span>
                {/* polite: a poll that changes the ranking is announced, without interrupting. */}
                <p aria-live="polite" className="text-sm font-bold leading-snug text-slate-900">{line}</p>
              </div>
            )}

            {prize && (
              <div className="mb-3 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
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
              <div className="mb-3 flex items-center justify-between gap-3 rounded-full bg-amber-50 px-4 py-1">
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
                    <BoardRow row={view.unrankedMe} board={board} reduce={reduce} />
                  </ol>
                )}
              </>
            ) : (
              <>
                {view.podium.length > 0 && <Podium rows={view.podium} board={board} keys={view.keys} />}

                <ol className="space-y-2">
                  <AnimatePresence initial={false}>
                    {view.list.map((row) => (
                      <BoardRow key={view.keys.get(row)} row={row} board={board} reduce={reduce} />
                    ))}
                  </AnimatePresence>
                  {view.unrankedMe && <BoardRow row={view.unrankedMe} board={board} reduce={reduce} />}
                </ol>

                {view.pinMe && view.me && (
                  // Sticks just above the fixed bottom nav while the list scrolls under it.
                  <div className="sticky bottom-[calc(var(--bottom-nav-height)+var(--pwa-safe-bottom)+0.5rem)] z-10 mt-3">
                    <ol aria-label="Your position" className="rounded-3xl bg-surface shadow-lg">
                      <BoardRow row={view.me} board={board} reduce={reduce} />
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      </div>
    </>
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

function BoardRow({ row, board, reduce }: { row: LeaderboardRow; board: LeaderboardBoard; reduce: boolean | null }) {
  const ranked = row.value > 0
  return (
    <motion.li
      // Rows glide to their new slot when the live poll reorders them.
      layout={reduce ? false : 'position'}
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={spring}
      aria-current={row.isMe ? 'true' : undefined}
      className={`flex min-h-[60px] items-center gap-3 rounded-3xl border p-3 ${
        row.isMe ? 'border-brand-200 bg-brand-50' : 'border-surface-border bg-surface-card'
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
    </motion.li>
  )
}

// Heights differ per place (visual order 2-1-3). 1st is the one filled brand element on the screen.
const PODIUM_STYLES = [
  { order: 'order-2', height: 'min-h-[10.5rem]', icon: 'h-7 w-7 text-amber-300', plate: 'border-transparent bg-brand-500', name: 'text-white', rank: 'text-white/80', value: 'text-white' },
  { order: 'order-1', height: 'min-h-[8.5rem]', icon: 'h-5 w-5 text-slate-400', plate: 'border-surface-border bg-surface-card', name: 'text-slate-900', rank: 'text-slate-500', value: 'text-slate-900' },
  { order: 'order-3', height: 'min-h-[7.5rem]', icon: 'h-5 w-5 text-orange-500', plate: 'border-orange-200 bg-orange-50', name: 'text-slate-900', rank: 'text-slate-500', value: 'text-slate-900' },
] as const

/**
 * Top three, drawn 2-1-3 so first place stands in the middle and tallest.
 * That is visual order only (`order-*`): the DOM stays 1-2-3 so a screen reader
 * hears the leader first.
 */
function Podium({
  rows,
  board,
  keys,
}: {
  rows: LeaderboardRow[]
  board: LeaderboardBoard
  keys: Map<LeaderboardRow, string>
}) {
  return (
    <FadeIn>
      <ol aria-label="Top three" className="mb-4 grid grid-cols-3 items-end gap-2">
        {rows.map((row, i) => {
          const style = PODIUM_STYLES[i]
          const Icon = i === 0 ? Crown : Medal
          return (
            <li
              key={keys.get(row) ?? i}
              aria-current={row.isMe ? 'true' : undefined}
              className={`${style.order} ${style.height} flex min-w-0 flex-col items-center justify-end rounded-3xl border px-2 pb-4 pt-3 text-center ${style.plate} ${
                row.isMe ? 'ring-2 ring-brand-400' : ''
              }`}
            >
              <Icon aria-hidden="true" className={style.icon} />
              {/* The RPC's rank, not the slot: two members can share #1. */}
              <span className={`mt-1 text-[10px] font-black uppercase tracking-wide ${style.rank}`}>#{row.rank}</span>
              <span className={`mt-1 w-full truncate text-xs font-bold ${style.name}`}>{row.displayName || 'Member'}</span>
              {row.isMe && <span className="mt-1 inline-flex"><YouPill /></span>}
              <span className={`mt-1.5 flex justify-center ${style.value}`}>
                <RowValue row={row} board={board} />
              </span>
            </li>
          )
        })}
      </ol>
    </FadeIn>
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
    <div className="tile flex flex-col items-center px-5 py-10 text-center">
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
          <div key={i} className="h-14 animate-pulse rounded-3xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
