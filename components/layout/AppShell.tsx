// Server component — no 'use client' directive
// Only NavClient (pathname-dependent nav) hydrates on the client
import NavClient from './NavClient'
import AccountMenu from './AccountMenu'

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

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-30">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-100">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-sm">
            <DumbbellIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">GymFlow</span>
        </div>
        {/* NavClient renders sidebar links + mobile bottom nav */}
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
      <div className="flex-1 md:ml-60 flex flex-col h-full overflow-hidden">
        {/* Top bar */}
        <header className="h-14 md:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0 z-20">
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-brand-600 rounded-lg flex items-center justify-center">
              <DumbbellIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-base font-bold text-gray-900">GymFlow</span>
          </div>
          <div className="hidden md:block" />
          <AccountMenu />
        </header>

        {/* Page content — only this scrolls */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 w-full">
          {children}
        </main>
      </div>

    </div>
  )
}
