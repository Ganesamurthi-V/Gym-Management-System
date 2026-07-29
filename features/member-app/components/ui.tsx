'use client'

/**
 * features/member-app/components/ui.tsx
 *
 * Shared presentation primitives for the Member App module. Extracted so every
 * section renders identical card, badge, table and empty-state markup rather
 * than each component re-deriving Tailwind classes.
 */

import { Inbox } from 'lucide-react'

// ─── Card shell ──────────────────────────────────────────────────────────────

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-surface-border p-6 ${className}`}>
      {children}
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Stat card — mirrors the Dashboard stat card structure ───────────────────

export function StatCard({
  label,
  value,
  icon,
  iconBg = 'bg-brand-50',
  iconColor = 'text-brand-600',
  badge,
}: {
  label: string
  value: string | number
  icon?: React.ReactNode
  iconBg?: string
  iconColor?: string
  badge?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-surface-border p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg} ${iconColor}`}>
            {icon}
          </div>
        )}
        <p className="text-xs font-semibold text-slate-500 truncate">{label}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-xl xs:text-2xl font-bold text-slate-900 leading-none">{value}</p>
        {badge}
      </div>
    </div>
  )
}

// ─── Badges ──────────────────────────────────────────────────────────────────

export type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'violet'

const BADGE_TONES: Record<BadgeTone, string> = {
  green:  'bg-emerald-50 text-emerald-700',
  amber:  'bg-amber-50 text-amber-700',
  red:    'bg-red-50 text-red-700',
  blue:   'bg-brand-50 text-brand-700',
  slate:  'bg-slate-100 text-slate-600',
  violet: 'bg-violet-50 text-violet-700',
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode
  tone?: BadgeTone
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}

/** Small coloured dot used by status rows. */
export function StatusDot({ tone }: { tone: BadgeTone }) {
  const colors: Record<BadgeTone, string> = {
    green:  'bg-emerald-500',
    amber:  'bg-amber-500',
    red:    'bg-red-500',
    blue:   'bg-brand-500',
    slate:  'bg-slate-400',
    violet: 'bg-violet-500',
  }
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[tone]}`} />
}

// ─── Table primitives ────────────────────────────────────────────────────────

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm min-w-[720px]">{children}</table>
    </div>
  )
}

export function Th({
  children,
  className = '',
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <th className={`text-left font-semibold text-slate-500 text-xs uppercase tracking-wide pb-3 px-3 ${className}`}>
      {children}
    </th>
  )
}

export function Td({
  children,
  className = '',
}: {
  children?: React.ReactNode
  className?: string
}) {
  return <td className={`py-3 px-3 text-slate-700 align-middle ${className}`}>{children}</td>
}

export function Tr({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <tr className={`border-b border-surface-border hover:bg-slate-50 transition-colors ${className}`}>
      {children}
    </tr>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon?: React.ReactNode
  title: string
  message?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-3">
        {icon ?? <Inbox className="w-5 h-5" />}
      </div>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {message && <p className="text-sm text-slate-500 mt-1 max-w-sm">{message}</p>}
    </div>
  )
}

// ─── Filter controls ─────────────────────────────────────────────────────────

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full sm:w-64 px-3 py-2 bg-white border border-surface-border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
    />
  )
}

/** Multi-select chip row. Empty selection means "all". */
export function ChipFilter<T extends string>({
  options,
  selected,
  onToggle,
  labelFor,
}: {
  options: readonly T[]
  selected: T[]
  onToggle: (value: T) => void
  labelFor: (value: T) => string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(option => {
        const active = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-colors ${
              active
                ? 'bg-brand-50 text-brand-700 border-brand-200'
                : 'bg-white text-slate-500 border-surface-border hover:bg-slate-50'
            }`}
          >
            {labelFor(option)}
          </button>
        )
      })}
    </div>
  )
}

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="range-from">From date</label>
      <input
        id="range-from"
        type="date"
        value={from}
        onChange={e => onFromChange(e.target.value)}
        className="px-3 py-2 bg-white border border-surface-border rounded-xl text-sm text-slate-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
      />
      <span className="text-slate-400 text-sm">–</span>
      <label className="sr-only" htmlFor="range-to">To date</label>
      <input
        id="range-to"
        type="date"
        value={to}
        onChange={e => onToChange(e.target.value)}
        className="px-3 py-2 bg-white border border-surface-border rounded-xl text-sm text-slate-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
      />
    </div>
  )
}

// ─── Toggle switch ───────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-brand-500' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
