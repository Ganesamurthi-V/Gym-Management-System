'use client'

import { createContext, useContext } from 'react'
import { MEMBER_CAP_TOOLTIP } from '@/lib/subscription-utils'

/**
 * True when this gym is on Trial/Free and already holds 50 members. Computed once on the
 * server in AppShell (plan + count, trial/free gyms only) and provided by ShellGuard, so every
 * "Add member" entry reads it without its own fetch. router.refresh() after an add or delete
 * re-renders the layout, which is what flips it.
 */
const MemberCapContext = createContext(false)
export const MemberCapProvider = MemberCapContext.Provider
export const useMemberCapped = () => useContext(MemberCapContext)

/**
 * Non-navigating stand-in for an "Add member" control while the cap is reached. CSS-only
 * tooltip: shows on hover and on focus (a tap focuses it on touch), and sits above the control
 * so the sidebar's overflow clipping does not hide it. Callers pass the sizing classes and
 * content (with a `Lock` icon) so it matches the live control's footprint.
 */
export function LockedAddMember({ className = '', children, ...rest }: {
  className?: string
  children: React.ReactNode
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-disabled="true"
      aria-label={MEMBER_CAP_TOOLTIP}
      title={MEMBER_CAP_TOOLTIP}
      {...rest}
      className={`group/cap relative cursor-not-allowed select-none bg-slate-200 text-slate-500 ${className}`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden w-max max-w-[13rem] rounded-lg bg-emphasis px-2.5 py-1.5 text-center text-xs font-medium normal-case tracking-normal text-emphasis-fg shadow-lg group-hover/cap:block group-focus/cap:block"
      >
        {MEMBER_CAP_TOOLTIP}
      </span>
    </span>
  )
}
