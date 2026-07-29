'use client'

import { useState } from 'react'
import { Trophy, Medal, Flame, Target, Sparkles } from 'lucide-react'
import type { GamificationSummary, LeaderboardEntry } from '@/types/member-app'
import { useComingSoon } from '../hooks/useMemberAppActions'
import {
  Card, EmptyState, SectionHeader, StatCard, TableWrap, Td, Th, Toggle, Tr,
} from './ui'

const CONFIG_CARDS = [
  { key: 'xp_multipliers',   title: 'XP Multipliers',   description: 'Boost XP for specific activities or time windows.' },
  { key: 'badge_rules',      title: 'Badge Rules',      description: 'Define the criteria that unlock each badge.' },
  { key: 'achievement_config', title: 'Achievement Config', description: 'Set milestone tiers and reward thresholds.' },
] as const

export default function GamificationPanel({
  summary,
  leaderboard,
}: {
  summary: GamificationSummary
  leaderboard: LeaderboardEntry[]
}) {
  // Local-only until the module owns persistence.
  const [leaderboardsEnabled, setLeaderboardsEnabled] = useState(summary.leaderboardsEnabled)
  const comingSoon = useComingSoon()

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total XP Earned"
          value={summary.totalXpEarned.toLocaleString('en-IN')}
          icon={<Trophy className="w-4 h-4" />}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          label="Badges Unlocked"
          value={summary.badgesUnlocked}
          icon={<Medal className="w-4 h-4" />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          label="Active Workout Streaks"
          value={summary.activeStreaks}
          icon={<Flame className="w-4 h-4" />}
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <StatCard
          label="Challenges Completed"
          value={summary.challengesCompleted}
          icon={<Target className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      <Card>
        <SectionHeader title="Leaderboard Preview" description="Top five members by XP." />

        {leaderboard.length === 0 ? (
          <EmptyState
            icon={<Trophy className="w-5 h-5" />}
            title="No leaderboard data yet"
            message="Rankings appear once members start earning XP."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th className="w-16">Rank</Th>
                <Th>Member</Th>
                <Th>XP</Th>
                <Th>Badges</Th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(entry => (
                <Tr key={entry.memberId}>
                  <Td>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                      {entry.rank}
                    </span>
                  </Td>
                  <Td className="font-semibold text-slate-900">{entry.memberName}</Td>
                  <Td className="text-slate-600">{entry.xp.toLocaleString('en-IN')}</Td>
                  <Td className="text-slate-600">{entry.badges}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card>
        <SectionHeader title="Configuration" description="Tune how gamification behaves in the member app." />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-surface-border">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Leaderboards</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Show member rankings inside the app.
              </p>
            </div>
            <Toggle
              checked={leaderboardsEnabled}
              onChange={next => {
                setLeaderboardsEnabled(next)
                comingSoon('Leaderboard')
              }}
              label="Enable leaderboards"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CONFIG_CARDS.map(card => (
              <div
                key={card.key}
                className="p-4 bg-white rounded-xl border border-surface-border flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-sm font-bold text-slate-900">{card.title}</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{card.description}</p>
                <button
                  type="button"
                  onClick={() => comingSoon(card.title)}
                  className="mt-auto self-start text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Configure
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
