'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import NavClient, { MobileNav } from './NavClient'
import AccountMenu from './AccountMenu'
import { createClient } from '@/lib/supabase/client'

const SHELL_EXCLUDED = ['/auth/', '/onboarding']
const SIDEBAR_KEY = 'gymflow_sidebar_collapsed'

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

import type { User } from '@supabase/supabase-js'
import type { getGym } from '@/lib/dal'

type GymRow = Awaited<ReturnType<typeof getGym>>['gym']

interface ShellGuardProps {
  children: React.ReactNode
  initialUser: User | null
  initialGym: GymRow
  initialIsActive: boolean
  initialUnreadCount: number
}

export default function ShellGuard({ children, initialUser, initialGym, initialIsActive, initialUnreadCount }: ShellGuardProps) {
  const pathname = usePathname()
  const isShellless = SHELL_EXCLUDED.some(p => pathname.startsWith(p))

  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Effect 1: Mount-time setup — restore sidebar state
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === 'true') setCollapsed(true)
    setMounted(true)
  }, [])

  // Effect 2: Auth guard — set up focus listener and 10s interval.
  // Does NOT include `pathname` so the interval is not reset on every navigation.
  useEffect(() => {
    if (isShellless) return

    if (!initialUser || !initialIsActive) {
      const supabase = createClient()
      supabase.auth.signOut().then(() => {
        window.location.href = '/auth/login'
      })
      return
    }

    const supabase = createClient()
    
    const checkAuth = async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error || !user) {
        // User is invalid or logged out
        await supabase.auth.signOut()
        window.location.href = '/auth/login'
        return
      }

      // Check real-time database status
      if (user.email) {
        const { data: isActive } = await supabase.rpc('check_gym_active', { p_email: user.email })
        if (isActive === false) {
          await supabase.auth.signOut()
          window.location.href = '/auth/login'
        }
      }
    }

    // Check on window focus, and every 10 seconds
    window.addEventListener('focus', checkAuth)
    const interval = setInterval(checkAuth, 10000)
    
    return () => {
      window.removeEventListener('focus', checkAuth)
      clearInterval(interval)
    }
  }, [isShellless, initialUser, initialIsActive])

  function toggle() {
    setCollapsed(prev => {
      localStorage.setItem(SIDEBAR_KEY, String(!prev))
      return !prev
    })
  }

  if (isShellless) return <>{children}</>

  return (
    <div className="min-h-full">

      {/* ── Desktop Sidebar ── */}
      <aside
        onClick={collapsed ? toggle : undefined}
        className={`
          hidden md:flex flex-col bg-white border-r border-slate-200
          fixed inset-y-0 left-0 z-30 overflow-hidden
          transition-[width] duration-300 ease-in-out group/sidebar
          ${collapsed ? 'w-14 cursor-pointer hover:w-60' : 'w-60 cursor-default'}
        `}
      >
        {/* ── Logo row ── */}
        <div className="flex items-center h-16 border-b border-slate-100 flex-shrink-0 px-3">
          {/* Logo icon — always visible */}
          <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
            <DumbbellIcon className="w-4 h-4 text-white" />
          </div>

          {/* gymflow text + collapse arrow — only when expanded */}
          <div className={`
            flex items-center flex-1 min-w-0 ml-3
            transition-all duration-200
            ${collapsed ? 'opacity-0 w-0 ml-0 overflow-hidden group-hover/sidebar:opacity-100 group-hover/sidebar:w-auto group-hover/sidebar:ml-3' : 'opacity-100'}
          `}>
            <span className="text-lg font-bold text-slate-900 tracking-tight flex-1 truncate whitespace-nowrap">
              gymflow
            </span>
            {/* Arrow — only visible when expanded, click to collapse */}
            <button
              onClick={e => { e.stopPropagation(); toggle() }}
              title="Collapse sidebar"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0 ml-1"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Nav links ── */}
        <NavClient collapsed={collapsed} />

        {/* ── Add Member button ── */}
        <div className={`flex-shrink-0 transition-all duration-200 ${collapsed ? 'px-2 pb-4 group-hover/sidebar:px-3' : 'px-3 pb-4'}`}>
          <a
            href="/members/new"
            onClick={e => e.stopPropagation()}
            title={collapsed ? 'Add Member' : undefined}
            className={`
              flex items-center justify-center gap-2 w-full py-2.5
              bg-gradient-to-r from-brand-500 to-brand-600 text-white
              text-sm font-semibold rounded-xl
              hover:from-brand-600 hover:to-brand-700 transition-all
            `}
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            <span className={`
              whitespace-nowrap overflow-hidden transition-all duration-200
              ${collapsed ? 'w-0 opacity-0 group-hover/sidebar:w-auto group-hover/sidebar:opacity-100' : 'w-auto opacity-100'}
            `}>
              Add Member
            </span>
          </a>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className={`
        flex flex-col min-h-screen min-w-0
        transition-[padding] duration-300 ease-in-out
        ${collapsed ? 'md:pl-14' : 'md:pl-60'}
      `}>
        <header className="sticky top-0 h-14 md:h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center flex-shrink-0 z-20">
          <div className="w-full px-4 md:px-6 flex items-center justify-between">
            <div className="flex items-center gap-2 md:hidden">
              <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-brand-600 rounded-lg flex items-center justify-center">
                <DumbbellIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-base font-bold text-slate-900">gymflow</span>
            </div>
            <div className="hidden md:block" />
            <AccountMenu 
              initialEmail={initialUser?.email} 
              initialGymId={initialGym?.id}
              initialGymName={initialGym?.name}
              initialUnreadCount={initialUnreadCount} 
            />
          </div>
        </header>

        <main className="flex-1 w-full bg-slate-50 min-w-0">
          <div className="p-4 md:p-6 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile nav ── */}
      <MobileNav />
    </div>
  )
}
