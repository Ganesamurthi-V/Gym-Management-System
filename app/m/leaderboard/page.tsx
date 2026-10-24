import type { Metadata } from 'next'
import { getMemberWithGym, getMemberGamification, getMemberLeaderboard } from '@/lib/member/member-data'
import { parseLeaderboardBoard } from '@/lib/gamification/mapLeaderboard'
import { startPageTimer } from '@/lib/perf'
import LeaderboardClient from './LeaderboardClient'

export const metadata: Metadata = { title: 'Leaderboard' }

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.
//
// Authorization is `app/m/layout.tsx` (a real linked member row). Both RPCs
// below resolve the member and gym from auth.uid(), so nothing here takes an id.

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string | string[] }>
}) {
  const done = startPageTimer('leaderboard')

  const { board: boardParam } = await searchParams
  // An unknown ?board= falls back to the default board instead of a 500 from the RPC.
  const board = parseLeaderboardBoard(Array.isArray(boardParam) ? boardParam[0] : boardParam)

  // Gate first: the layout renders in parallel with this page and is skipped on client-side
  // navigation, so a plan-blocked member must not reach the RPCs below. Shares the layout's
  // cached member lookup, so it adds no round trip.
  if (!(await getMemberWithGym())) {
    done()
    return null
  }

  // Independent, so one round trip: the page costs the slower of the two.
  const [summary, rows] = await Promise.all([
    getMemberGamification(),
    getMemberLeaderboard(board),
  ])

  done()

  return (
    <LeaderboardClient
      initialBoard={board}
      initialRows={rows}
      leaderboardsEnabled={summary.leaderboardsEnabled}
      showOnLeaderboard={summary.showOnLeaderboard}
      weeklyPrize={summary.weeklyPrize}
      monthlyPrize={summary.monthlyPrize}
    />
  )
}
