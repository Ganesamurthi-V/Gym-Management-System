'use client'

import type { Achievement, AchievementRarity } from '@/lib/member/achievements/types'

/**
 * Rarity-aware achievement card.
 *
 * Visual treatment per spec:
 * - Icon background: rarity color at 15% opacity
 * - Border: rarity color at 30% opacity (unlocked) or slate (locked)
 * - Rarity label: visible text (not color-only)
 * - Progress bar: rarity-colored, only when locked + measurable
 * - Mythic: subtle pulse animation when unlocked
 * - Locked: muted at ~60% opacity, lock icon replaces achievement icon
 */

const RARITY_STYLES: Record<AchievementRarity, {
  border: string
  iconBg: string
  label: string
  labelText: string
  bar: string
}> = {
  common: {
    border: 'border-rarity-common/30',
    iconBg: 'bg-rarity-common/15',
    label: 'COMMON',
    labelText: 'text-rarity-common',
    bar: 'bg-rarity-common',
  },
  rare: {
    border: 'border-rarity-rare/30',
    iconBg: 'bg-rarity-rare/15',
    label: 'RARE',
    labelText: 'text-rarity-rare',
    bar: 'bg-rarity-rare',
  },
  epic: {
    border: 'border-rarity-epic/30',
    iconBg: 'bg-rarity-epic/15',
    label: 'EPIC',
    labelText: 'text-rarity-epic',
    bar: 'bg-rarity-epic',
  },
  legendary: {
    border: 'border-rarity-legendary/30',
    iconBg: 'bg-rarity-legendary/15',
    label: 'LEGENDARY',
    labelText: 'text-rarity-legendary',
    bar: 'bg-rarity-legendary',
  },
  mythic: {
    border: 'border-rarity-mythic/30',
    iconBg: 'bg-rarity-mythic/15',
    label: 'MYTHIC',
    labelText: 'text-rarity-mythic',
    bar: 'bg-rarity-mythic',
  },
}

export default function AchievementCard({ achievement }: { achievement: Achievement }) {
  const { unlocked, rarity, name, description, icon, progress, requirement } = achievement
  const style = RARITY_STYLES[rarity]

  const showProgress = !unlocked && progress !== undefined && requirement > 0
  const progressPct = showProgress ? Math.min(100, Math.round((progress! / requirement) * 100)) : 0

  return (
    <div
      className={`
        card relative flex flex-col items-center p-4 text-center transition-all min-h-[11rem]
        ${unlocked
          ? `border ${style.border}`
          : 'border border-slate-200 opacity-60'
        }
        ${unlocked && rarity === 'mythic' ? 'animate-pulse-soft' : ''}
      `}
      role="article"
      aria-label={`Achievement: ${name}. ${unlocked ? 'Earned' : 'Locked'}. Rarity: ${rarity}.`}
    >
      {/* Icon */}
      <span
        className={`
          mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl text-xl
          ${unlocked ? style.iconBg : 'bg-slate-100'}
        `}
        aria-label={`Achievement icon: ${name}`}
      >
        {unlocked ? icon : '🔒'}
      </span>

      {/* Name + description */}
      <p className={`text-xs font-bold leading-tight ${unlocked ? 'text-slate-900' : 'text-slate-500'}`}>
        {name}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-slate-400 line-clamp-2">
        {description}
      </p>

      {/* Progress bar (locked + measurable only) */}
      {showProgress && (
        <div className="mt-2.5 w-full">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold text-slate-400">{progress}/{requirement}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Rarity label — always visible text (accessibility: not color-only) */}
      <div className="mt-auto pt-2.5 flex items-center gap-1">
        <span className={`h-1.5 w-1.5 rounded-full ${unlocked ? style.bar : 'bg-slate-300'}`} />
        <span className={`text-[9px] font-black tracking-[0.12em] ${unlocked ? style.labelText : 'text-slate-400'}`}>
          {style.label}
        </span>
      </div>
    </div>
  )
}
