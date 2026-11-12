'use client'

import { Lock } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { spring } from '@/lib/motion'
import type { Achievement, AchievementRarity } from '@/lib/member/achievements/types'
import { formatDate } from '@/lib/member/member-utils'

/**
 * Rarity-themed achievement card with badge images.
 *
 * - Round badge image with rarity-colored ring/glow when earned
 * - Grayscale + lock overlay when not yet earned
 * - Name + description
 * - Progress bar with fraction text (when locked & measurable)
 * - Rarity label in color
 */

const BADGE_STYLES: Record<AchievementRarity, {
  ring: string
  border: string
  glow: string
  labelText: string
  barColor: string
}> = {
  mythic: {
    ring: 'ring-pink-400/60',
    border: 'border-pink-200',
    glow: 'shadow-lg shadow-pink-200/50',
    labelText: 'text-pink-600',
    barColor: 'bg-gradient-to-r from-pink-400 to-fuchsia-500',
  },
  legendary: {
    ring: 'ring-amber-400/60',
    border: 'border-amber-200',
    glow: 'shadow-lg shadow-amber-200/50',
    labelText: 'text-amber-600',
    barColor: 'bg-gradient-to-r from-amber-400 to-orange-500',
  },
  epic: {
    ring: 'ring-violet-400/60',
    border: 'border-violet-200',
    glow: 'shadow-lg shadow-violet-200/50',
    labelText: 'text-violet-600',
    barColor: 'bg-gradient-to-r from-violet-400 to-purple-500',
  },
  rare: {
    ring: 'ring-blue-400/60',
    border: 'border-blue-200',
    glow: 'shadow-md shadow-blue-100/50',
    labelText: 'text-blue-600',
    barColor: 'bg-gradient-to-r from-blue-400 to-indigo-500',
  },
  common: {
    ring: 'ring-slate-300/60',
    border: 'border-slate-200',
    glow: 'shadow-sm',
    labelText: 'text-slate-500',
    barColor: 'bg-slate-400',
  },
}

export default function AchievementCard({
  achievement,
  isNew = false,
}: {
  achievement: Achievement
  /** Unlocked for the first time on this visit. */
  isNew?: boolean
}) {
  const { unlocked, unlockedAt, rarity, name, description, icon, badgeImage, badgeSize, progress, requirement } = achievement
  const style = BADGE_STYLES[rarity]
  const reduce = useReducedMotion()

  const showProgress = !unlocked && progress !== undefined && requirement > 0
  const progressPct = showProgress ? Math.min(100, Math.round((progress! / requirement) * 100)) : 0

  // Badge pixel size: controlled per-achievement via badgeSize in definitions.ts
  // Default is 52px. Set to any pixel value (e.g. 60, 70, 80) to make a badge bigger.
  const size = badgeSize ?? 52

  return (
    <motion.div
      // Earned badges pop in once with a spring; locked ones just sit there, muted.
      initial={unlocked && !reduce ? { scale: 0.85, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring}
      className={`
        relative h-full rounded-3xl border bg-surface-card p-4
        ${unlocked
          ? `${style.border} ${style.glow}`
          : 'border-surface-border opacity-80'
        }
        ${isNew ? `ring-2 ${style.ring}` : ''}
      `}
      role="article"
      aria-label={`${name}. ${isNew ? 'Newly earned' : unlocked ? 'Earned' : 'Locked'}. ${rarity} rarity.`}
    >
      {/* New-unlock marker (top right, where the lock sits on locked cards) */}
      {isNew && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
          New
        </span>
      )}

      {/* Lock icon (top right) */}
      {!unlocked && (
        <div className="absolute top-3 right-3">
          <Lock className="h-3.5 w-3.5 text-slate-300" />
        </div>
      )}

      {/* Badge + text */}
      <div className="flex items-start gap-3">
        {/* Badge — size controlled per-achievement via badgeSize in definitions.ts */}
        <div className="h-[52px] w-[52px] shrink-0 flex items-center justify-center overflow-visible">
          {badgeImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={badgeImage}
              alt={name}
              width={size}
              height={size}
              className={`object-contain ${!unlocked ? 'grayscale opacity-40' : ''}`}
              style={{ width: `${size}px`, height: `${size}px`, maxWidth: 'none' }}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              className={`
                flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-xl
                ${unlocked ? 'bg-slate-50' : 'bg-slate-100 grayscale opacity-40'}
              `}
            >
              {icon}
            </div>
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
            <motion.div
              className={`h-full origin-left rounded-full ${style.barColor}`}
              initial={{ scaleX: reduce ? progressPct / 100 : 0 }}
              animate={{ scaleX: progressPct / 100 }}
              transition={reduce ? { duration: 0 } : spring}
            />
          </div>
        </div>
      )}

      {/* Rarity label + the date the unlock was recorded. Recorded unlocks are
          permanent, so the date is what tells a member "you still have this"
          when the progress it was earned with (e.g. a streak) has since reset. */}
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${unlocked ? style.labelText : 'text-slate-300'}`}>
          {rarity}
        </span>
        {unlocked && unlockedAt && (
          <span className="text-[10px] font-semibold text-slate-400">Earned on {formatDate(unlockedAt)}</span>
        )}
      </div>
    </motion.div>
  )
}
