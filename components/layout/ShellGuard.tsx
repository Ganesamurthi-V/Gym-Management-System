'use client'

import { usePathname } from 'next/navigation'
import NavClient from './NavClient'
import AccountMenu from './AccountMenu'

// Pages that should render WITHOUT the sidebar/header shell
const SHELL_EXCLUDED = ['/auth/', '/onboarding']

function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="1"    y="6.5" width="2.5" height="3" rx="0.5" />
      <rect x="12.5" y="6.5" width="2.5" height="3" rx="0.5" />
      <rect x="3.5"  y="5"   width="2"   height="6" rx="0.5" />
      <rect x="10.5" y="5"   width="2"   height="6" rx="0.5" />
      <rect x="5.5"  y="7"   width="5"   height="2" rx="0.5" />
    </svg>
  )
}

export default function ShellGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isShellless = SHELL_EXCLUDED.some(prefix => pathname.startsWith(prefix))

  // Auth and onboarding pages — render bare, no sidebar/header
  if (isShellless) return <>{children}</>

  return (
    <div className="min-h-full">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 fixed inset-y-0 left-0 z-30">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-100">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-sm">
            <DumbbellIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 tracking-tight">GymFlow</span>
        </div>
        <NavClient />
        <div className="px-3 pb-4">
          <a href="/members/new"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold rounded-xl hover:from-brand-600 hover:to-brand-700 transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            Add Member
          </a>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="md:pl-60 flex flex-col min-h-screen">
        {/* Top bar - fixed on mobile, sticky/scroll with page or fixed on desktop */}
        <header className="sticky top-0 h-14 md:h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0 z-20">
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <DumbbellIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-base font-bold text-slate-900">GymFlow</span>
          </div>
          <div className="hidden md:block" />
          <AccountMenu />
        </header>

        {/* Page content — natural flow */}
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-8 w-full bg-slate-50">
          {children}
        </main>
      </div>

    </div>
  )
}
