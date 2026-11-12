import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props =
  | { variant: 'root'; title: string; subtitle?: string; memberName: string; actions?: React.ReactNode }
  | { variant: 'sub'; title: string; backHref: string; backLabel?: string; actions?: React.ReactNode }

const circle = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full'

function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? '')
    .join('')
  return letters || 'M'
}

/**
 * Shared top bar for every member screen. Render it as the FIRST child of the page, outside
 * `.page-container` (it pads itself with the same gutter).
 *
 * MemberShell already pads the top safe area with `pt-safe-top` above <main>. A sticky element
 * would otherwise stick at the very top of the viewport, under the status bar, so the bar cancels
 * that shell padding with a negative margin and re-adds it as its own padding: it sits in the same
 * place at rest and keeps clear of the notch once stuck.
 */
export function MemberTopBar(props: Props) {
  return (
    <header
      className="sticky top-0 z-[var(--z-sticky)] -mt-[env(safe-area-inset-top,0px)] bg-surface/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md"
    >
      <div className="flex h-14 items-center gap-3 px-4 xs:px-5 sm:px-6">
        {props.variant === 'root' ? (
          <Link
            href="/m/profile"
            prefetch
            aria-label="Your profile"
            className={cn(circle, 'bg-brand-500 text-sm font-bold text-white')}
          >
            {initialsOf(props.memberName)}
          </Link>
        ) : (
          <Link
            href={props.backHref}
            prefetch
            aria-label={props.backLabel ?? 'Back'}
            className={cn(circle, 'bg-surface-secondary text-slate-700')}
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-slate-900">{props.title}</h1>
          {props.variant === 'root' && props.subtitle && (
            <p className="truncate text-xs text-slate-500">{props.subtitle}</p>
          )}
        </div>

        {props.actions && <div className="flex shrink-0 items-center gap-2">{props.actions}</div>}
      </div>
    </header>
  )
}

/** 40px round icon link for the bar's `actions` slot. */
export function TopBarButton({
  href,
  label,
  children,
}: Readonly<{ href: string; label: string; children: React.ReactNode }>) {
  return (
    <Link href={href} prefetch aria-label={label} className={cn(circle, 'bg-surface-secondary text-slate-700')}>
      {children}
    </Link>
  )
}
