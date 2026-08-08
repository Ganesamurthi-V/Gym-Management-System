'use client'

import { useState } from 'react'
import type { Achievement, AchievementRarity } from '@/lib/member/achievements/types'
import { RARITY_ORDER } from '@/lib/member/achievements/types'
import AchievementCard from './AchievementCard'

// ─── Rarity visual config ────────────────────────────────────────────────────

const RARITY_COLORS: Record<AchievementRarity, { dot: string; text: string; icon: string }> = {
  mythic: { dot: 'bg-pink-500', text: 'text-pink-600', icon: '💎' },
  legendary: { dot: 'bg-amber-500', text: 'text-amber-600', icon: '👑' },
  epic: { dot: 'bg-violet-500', text: 'text-violet-600', icon: '💜' },
  rare: { dot: 'bg-blue-500', text: 'text-blue-600', icon: '💙' },
  common: { dot: 'bg-slate-400', text: 'text-slate-500', icon: '⚪' },
}

type TabId = 'all' | 'earned' | 'locked'

interface Props {
  xp: number
  level: number
  levelTitle: string
  xpInLevel: number
  xpForNextLevel: number
  totalAchievements: number
  earnedCount: number
  earned: Achievement[]
  locked: Achievement[]
  allAchievements: Achievement[]
}

export default function RewardsClient({
  xp,
  level,
  levelTitle,
  xpInLevel,
  xpForNextLevel,
  totalAchievements,
  earnedCount,
  earned,
  locked,
  allAchievements,
}: Props) {
  const [tab, setTab] = useState<TabId>('all')

  const displayed = tab === 'earned' ? earned : tab === 'locked' ? locked : allAchievements

  return (
    <div className="page-container py-6 pb-32">
      {/* Header */}
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Achievements</h1>
          <p className="mt-0.5 text-xs text-slate-400 font-medium">Track your progress and unlock rewards</p>
        </div>
      </header>

      {/* ─── Level Hero Card ─────────────────────────────────────────────── */}
      <div className="mb-5 rounded-2xl bg-gradient-to-br from-violet-50 via-white to-brand-50 border border-violet-100 p-5">
        <div className="flex items-center gap-4">
          {/* Level badge */}
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-400 to-brand-500 opacity-20 animate-pulse" style={{ animationDuration: '3s' }} />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-brand-600 shadow-lg shadow-violet-200">
              <span className="text-2xl">🏆</span>
            </div>
          </div>

          {/* Level info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-lg font-black text-slate-900">Level {level}</p>
              <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-[10px] font-bold text-white">
                {levelTitle}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700"
                  style={{ width: `${Math.min(100, (xpInLevel / xpForNextLevel) * 100)}%` }}
                />
              </div>
            </div>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              {xpInLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
            </p>
          </div>

          {/* XP + achievement count */}
          <div className="text-right shrink-0">
            <p className="text-lg font-black text-brand-600">{xp.toLocaleString()} XP</p>
            <p className="text-[10px] font-semibold text-slate-400">Total XP</p>
            <p className="mt-1 text-sm font-black text-emerald-600">{earnedCount} / {totalAchievements}</p>
            <p className="text-[10px] font-semibold text-slate-400">Achievements</p>
          </div>
        </div>
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex border-b border-slate-200">
        {([
          ['all', `All (${totalAchievements})`],
          ['earned', `Earned (${earnedCount})`],
          ['locked', `Locked (${locked.length})`],
        ] as [TabId, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-3 text-xs font-bold text-center transition-all border-b-2 ${
              tab === id
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── Rarity-grouped grid ─────────────────────────────────────────── */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="mb-3 text-4xl">🎯</span>
          <p className="text-sm font-bold text-slate-700">
            {tab === 'earned' ? 'No achievements earned yet' : 'All achievements unlocked!'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Keep training to unlock rewards.</p>
        </div>
      ) : (
        groupByRarity(displayed).map(([rarity, achievements]) => (
          <section key={rarity} className="mb-6">
            <RarityHeader rarity={rarity} count={achievements.length} />
            <div className="grid grid-cols-2 gap-3">
              {achievements.map(a => (
                <AchievementCard key={a.id} achievement={a} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByRarity(achievements: Achievement[]): [AchievementRarity, Achievement[]][] {
  const groups = new Map<AchievementRarity, Achievement[]>()
  for (const a of achievements) {
    const list = groups.get(a.rarity) ?? []
    list.push(a)
    groups.set(a.rarity, list)
  }
  return RARITY_ORDER.filter(r => groups.has(r)).map(r => [r, groups.get(r)!])
}

function RarityHeader({ rarity, count }: { rarity: AchievementRarity; count: number }) {
  const c = RARITY_COLORS[rarity]
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
      <span className={`text-xs font-black uppercase tracking-[0.1em] ${c.text}`}>
        {rarity}
      </span>
      <span className="text-xs font-bold text-slate-300">({count})</span>
    </div>
  )
}
