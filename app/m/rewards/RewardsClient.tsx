'use client'

import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { CountUp, FadeIn, Stagger, StaggerItem } from '@/components/ui/motion'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { SectionSwitch } from '@/components/member/SectionSwitch'
import type { Achievement, AchievementRarity } from '@/lib/member/achievements/types'
import { RARITY_ORDER } from '@/lib/member/achievements/types'
import AchievementCard from './AchievementCard'
import MemberEvents from './MemberEvents'

// ─── Rarity visual config ────────────────────────────────────────────────────

const RARITY_COLORS: Record<AchievementRarity, { dot: string; text: string }> = {
  mythic: { dot: 'bg-pink-500', text: 'text-pink-600' },
  legendary: { dot: 'bg-amber-500', text: 'text-amber-600' },
  epic: { dot: 'bg-violet-500', text: 'text-violet-600' },
  rare: { dot: 'bg-blue-500', text: 'text-blue-600' },
  common: { dot: 'bg-slate-400', text: 'text-slate-500' },
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
  /** The gym's switch; hides the leaderboard entry when off. */
  leaderboardsEnabled: boolean
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
  leaderboardsEnabled,
}: Props) {
  const [tab, setTab] = useState<TabId>('all')

  // `isNew` is true only on the server render that recorded the unlock. The
  // member shell re-renders this page in the background every 30 s
  // (useMemberRealtime), and on that render the same badge is no longer new, so
  // without remembering it here the highlight would vanish half a minute after
  // it appeared. Kept for as long as this screen stays mounted.
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(
    () => new Set(allAchievements.filter(a => a.isNew).map(a => a.id)),
  )
  useEffect(() => {
    const fresh = allAchievements.filter(a => a.isNew).map(a => a.id)
    if (fresh.length === 0) return
    setNewIds(prev => (fresh.every(id => prev.has(id)) ? prev : new Set([...prev, ...fresh])))
  }, [allAchievements])

  const reduce = useReducedMotion()
  const levelPct = Math.min(1, xpInLevel / xpForNextLevel)

  const displayed = tab === 'earned' ? earned : tab === 'locked' ? locked : allAchievements

  return (
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

      {/* ─── Level strip ─────────────────────────────────────────────────── */}
      <FadeIn>
        <div className="tile mb-3 p-4">
          <div className="flex items-center gap-3">
            {/* Level badge — uses /public/level/level_N.webp images */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getLevelBadge(level)}
              alt={`Level ${level}`}
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 object-contain"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">
                Level {level} · {levelTitle}
              </p>
              <p className="text-xl font-black leading-tight tracking-tight text-slate-900 tabular-nums">
                <CountUp value={xp} /> <span className="text-xs font-bold text-slate-500">XP</span>
              </p>
            </div>
            <p className="shrink-0 text-right text-[11px] font-semibold leading-tight text-slate-500">
              <span className="block text-sm font-black text-slate-900 tabular-nums">
                {earnedCount}/{totalAchievements}
              </span>
              achievements
            </p>
          </div>

          {/* Scaled with a transform (not width) so it never triggers layout. */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className="h-full origin-left rounded-full bg-brand-500"
              initial={{ scaleX: reduce ? levelPct : 0 }}
              animate={{ scaleX: levelPct }}
              transition={reduce ? { duration: 0 } : { ...spring, delay: 0.15 }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-slate-500 tabular-nums">
            {xpInLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP to level {level + 1}
          </p>
        </div>
      </FadeIn>

      <MemberEvents />

      {/* ─── Badges ──────────────────────────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">Badges</h2>
      <div className="mb-5 flex gap-2">
          {([
            ['all', `All (${totalAchievements})`],
            ['earned', `Earned (${earnedCount})`],
            ['locked', `Locked (${locked.length})`],
          ] as [TabId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={cn(
                'min-h-11 rounded-full px-4 text-xs font-bold transition-colors',
                tab === id ? 'bg-brand-500 text-white' : 'bg-surface-secondary text-slate-600',
              )}
            >
              {label}
            </button>
          ))}
      </div>

      {/* ─── Rarity-grouped grid ─────────────────────────────────────────── */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Target aria-hidden="true" className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-700">
            {tab === 'earned' ? 'No achievements earned yet' : 'All achievements unlocked!'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Keep training to unlock rewards.</p>
        </div>
      ) : (
        groupByRarity(displayed).map(([rarity, achievements]) => (
          <section key={rarity} className="mb-6">
            <RarityHeader rarity={rarity} count={achievements.length} />
            <Stagger className="grid grid-cols-2 gap-3">
              {achievements.map(a => (
                <StaggerItem key={a.id}>
                  <AchievementCard achievement={a} isNew={newIds.has(a.id)} />
                </StaggerItem>
              ))}
            </Stagger>
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

/**
 * Maps member level (1-10+) to the corresponding badge image.
 * Images: /public/level/level_1.webp through level_9.webp, level_!0.webp (level 10).
 * Levels above 10 use the level 10 badge.
 */
function getLevelBadge(level: number): string {
  if (level >= 10) return '/level/level_!0.webp'
  if (level < 1) return '/level/level_1.webp'
  return `/level/level_${level}.webp`
}
