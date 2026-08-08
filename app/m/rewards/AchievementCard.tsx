'use client'

import { Lock } from 'lucide-react'
import type { Achievement, AchievementRarity } from '@/lib/member/achievements/types'

/**
 * Rarity-themed achievement card matching the reference design:
 * - Round badge icon with rarity-colored gradient background
 * - Name + description
 * - Progress bar with fraction text (when locked & measurable)
 * - Rarity label in color
 * - Lock icon overlay when not yet earned
 * - Mythic cards get a subtle border glow when earned
 */

const BADGE_STYLES: Record<AchievementRarity, {
  gradient: string
  border: string
  glow: string
  labelText: string
  barColor: string
}> = {
  mythic: {
    gradient: 'from-pink-400 to-fuchsia-600',
    border: 'border-pink-200',
    glow: 'shadow-pink-100',
    labelText: 'text-pink-600',
    barColor: 'bg-gradient-to-r from-pink-400 to-fuchsia-500',
  },
  legendary: {
    gradient: 'from-amber-400 to-orange-500',
    border: 'border-amber-200',
    glow: 'shadow-amber-100',
    labelText: 'text-amber-600',
    barColor: 'bg-gradient-to-r from-amber-400 to-orange-500',
  },
  epic: {
    gradient: 'from-violet-400 to-purple-600',
    border: 'border-violet-200',
    glow: 'shadow-violet-100',
    labelText: 'text-violet-600',
    barColor: 'bg-gradient-to-r from-violet-400 to-purple-500',
  },
  rare: {
    gradient: 'from-blue-400 to-indigo-500',
    border: 'border-blue-200',
    glow: 'shadow-blue-100',
    labelText: 'text-blue-600',
    barColor: 'bg-gradient-to-r from-blue-400 to-indigo-500',
  },
  common: {
    gradient: 'from-slate-300 to-slate-400',
    border: 'border-slate-200',
    glow: 'shadow-slate-100',
    labelText: 'text-slate-500',
    barColor: 'bg-slate-400',
  },
}

export default function AchievementCard({ achievement }: { achievement: Achievement }) {
  const { unlocked, rarity, name, description, icon, progress, requirement } = achievement
  const style = BADGE_STYLES[rarity]

  const showProgress = !unlocked && progress !== undefined && requirement > 0
  const progressPct = showProgress ? Math.min(100, Math.round((progress! / requirement) * 100)) : 0

  return (
    <div
      className={`
        relative rounded-2xl border bg-white p-3.5 transition-all
        ${unlocked
          ? `${style.border} shadow-md ${style.glow}`
          : 'border-slate-100 shadow-sm'
        }
        ${unlocked && rarity === 'mythic' ? 'ring-1 ring-pink-200/50' : ''}
      `}
      role="article"
      aria-label={`${name}. ${unlocked ? 'Earned' : 'Locked'}. ${rarity} rarity.`}
    >
      {/* Lock icon (top right) */}
      {!unlocked && (
        <div className="absolute top-3 right-3">
          <Lock className="h-3.5 w-3.5 text-slate-300" />
        </div>
      )}

      {/* Badge icon */}
      <div className="flex items-start gap-3">
        <div
          className={`
            relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
            ${unlocked
              ? `bg-gradient-to-br ${style.gradient} shadow-sm`
              : 'bg-slate-100'
            }
          `}
        >
          <span className={`text-lg ${unlocked ? '' : 'grayscale opacity-40'}`}>
            {icon}
          </span>
          {/* Earned ring effect */}
          {unlocked && (
            <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${style.gradient} opacity-20 blur-[2px]`} />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className={`text-[13px] font-bold leading-tight ${unlocked ? 'text-slate-900' : 'text-slate-500'}`}>
            {name}
          </p>
          <p className={`mt-0.5 text-[11px] leading-snug ${unlocked ? 'text-slate-500' : 'text-slate-400'}`}>
            {description}
          </p>
        </div>
      </div>

      {/* Progress bar (locked + measurable) */}
      {showProgress && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-semibold text-slate-400">
            {progress} / {requirement}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${style.barColor}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Rarity label */}
      <div className="mt-2.5">
        <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${unlocked ? style.labelText : 'text-slate-300'}`}>
          {rarity}
        </span>
      </div>
    </div>
  )
}
