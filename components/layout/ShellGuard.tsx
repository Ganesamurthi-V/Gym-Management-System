'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import NavClient, { MobileNav } from './NavClient'
import AccountMenu from './AccountMenu'
import { signOutViaApi } from '@/lib/auth/client-auth'
import Image from 'next/image'
import toast from 'react-hot-toast'

import TrialBanner from './TrialBanner'
import { computeSubscriptionState } from '@/lib/subscription-utils'

const SHELL_EXCLUDED = ['/auth/', '/owner/onboarding', '/owner/subscription']
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
  initialSubscriptionStatus: string
  initialTrialDaysLeft: number
}

export default function ShellGuard({ children, initialUser, initialGym, initialIsActive, initialUnreadCount, initialSubscriptionStatus, initialTrialDaysLeft }: ShellGuardProps) {
  const pathname = usePathname()
  const isShellless = SHELL_EXCLUDED.some(p => pathname.startsWith(p))

  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Live subscription state — updated in real-time via the Realtime channel.
  // Seeded from server-rendered initial values so the first paint is instant.
  const [liveSubStatus, setLiveSubStatus] = useState(initialSubscriptionStatus)
  const [liveDaysLeft, setLiveDaysLeft] = useState(initialTrialDaysLeft)
  const [liveGymName, setLiveGymName] = useState(initialGym?.name || '')

  // Effect 1: Mount-time setup — restore sidebar state
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === 'true') setCollapsed(true)
    setMounted(true)
  }, [])

  // Effect 2: Auth guard — set up focus listener and 60s interval.
  // Does NOT include `pathname` so the interval is not reset on every navigation.
  useEffect(() => {
    if (isShellless) return

    if (!initialUser) {
      signOutViaApi().then(() => {
        window.location.href = '/auth/login'
      })
      return
    }

    if (!initialIsActive) {
      // check_gym_active returns false for BOTH admin-deactivated gyms and
      // expired trials/subscriptions. Expired accounts stay logged in and go
      // to the subscription page; only deactivated accounts are signed out.
      if (initialSubscriptionStatus === 'expired') {
        window.location.href = '/owner/subscription'
      } else {
        signOutViaApi().then(() => {
          window.location.href = '/auth/login?error=blocked'
        })
      }
      return
    }

    const checkAuth = async () => {
      // Skip check entirely when tab is in the background.
      if (document.hidden) return

      // One request now covers both the session check and the authorization
      // refresh. This used to call `supabase.auth.getClaims()` first as a cheap
      // local JWT check before hitting the API — but /api/account/status is
      // wrapped in withAuth, which calls getUser() server-side and answers 401
      // for a missing, expired, or revoked session. The pre-check was therefore
      // redundant with the very next line, and dropping it removes both a round
      // trip and the browser's direct dependency on Supabase.
      const res = await fetch('/api/account/status', {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        cache: 'no-store',
      })
      if (!res.ok) {
        if (res.status === 401) {
          await signOutViaApi()
          window.location.href = '/auth/login'
        }
        return
      }
      const json = await res.json()
      const gymRow = json.data

      if (!gymRow || gymRow.is_active === false) {
        await signOutViaApi()
        window.location.href = '/auth/login?error=blocked'
        return
      }

      if (gymRow.name) setLiveGymName(gymRow.name)
      const refreshedState = computeSubscriptionState(gymRow)
      setLiveSubStatus(refreshedState.status)
      setLiveDaysLeft(refreshedState.daysLeft ?? 0)
      if (refreshedState.isExpired && pathname !== '/owner/subscription') {
        window.location.href = '/owner/subscription'
        return
      }

      // Detect subscription just activated while user is on the paywall — same
      // behaviour as the former Realtime channel callback.
      if (
        !refreshedState.isExpiringSoon &&
        (gymRow.subscription_status === 'active' || gymRow.subscription_status === 'trial') &&
        pathname === '/owner/subscription'
      ) {
        toast.success(
          gymRow.subscription_status === 'active'
            ? 'Your subscription has been activated!'
            : 'Your trial has been reset. Redirecting...',
        )
        setTimeout(() => {
          window.location.href = '/owner/dashboard'
        }, 1500)
      }
    }

    // Issue 3 fix: Focus listener provides instant re-check when user switches tabs.
    // Phase 4: Replaced Supabase Realtime channel with a 30 s poll interval.
    // checkAuth already fetches /api/account/status and applies every guard that
    // the Realtime callback did (name update, deactivation sign-out, subscription
    // state, expiry redirect, activation toast). Running it periodically makes
    // the socket redundant with zero Vercel cost and zero browser→Supabase traffic.
    window.addEventListener('focus', checkAuth)
    const pollInterval = setInterval(checkAuth, 30_000)
    
    return () => {
      window.removeEventListener('focus', checkAuth)
      clearInterval(pollInterval)
    }
  }, [isShellless, initialUser, initialIsActive, initialSubscriptionStatus, initialGym?.id, pathname])

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
          ${collapsed ? 'w-14 cursor-pointer hover:w-60' : 'w-56 lg:w-60 cursor-default'}
        `}
      >
        {/* ── Logo row ── */}
        <div className="flex items-center justify-between h-16 border-b border-slate-100 flex-shrink-0 px-3 relative">
          <div className="flex items-center flex-1 min-w-0 py-2 overflow-hidden">
            <Image 
              src="/logo_landspace_without_bg.png" 
              alt={`${liveGymName || 'GymFlow'} Logo`} 
              width={140} 
              height={40} 
              className={`object-contain object-left transition-all duration-200 ${collapsed ? 'opacity-0 w-0 group-hover/sidebar:opacity-100 group-hover/sidebar:w-auto' : 'opacity-100 w-auto'}`} 
            />
            {collapsed && (
              <Image 
                src="/logo_only.png" 
                alt="Logo" 
                width={32} 
                height={32} 
                className="object-contain group-hover/sidebar:hidden absolute left-3" 
              />
            )}
          </div>

          {/* Arrow — only visible when expanded, click to collapse */}
          <button
            onClick={e => { e.stopPropagation(); toggle() }}
            title="Collapse sidebar"
            className={`w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0 ml-1 relative z-10 ${collapsed ? 'hidden group-hover/sidebar:flex' : ''}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* ── Nav links ── */}
        <NavClient collapsed={collapsed} />

        {/* ── Add Member button ── */}
        <div className={`flex-shrink-0 transition-all duration-200 ${collapsed ? 'px-2 pb-4 group-hover/sidebar:px-3' : 'px-3 pb-4'}`}>
          <a
            href="/owner/members/new"
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
        ${collapsed ? 'md:pl-14' : 'md:pl-56 lg:pl-60'}
      `}>
        <header className="sticky top-0 h-14 md:h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center flex-shrink-0 z-20">
          <div className="w-full px-3 xs:px-4 md:px-6 flex items-center justify-between relative">
            <div className="flex items-center gap-2">
              <Image src="/logo_only.png" alt={`${liveGymName || 'GymFlow'} Logo`} width={40} height={40} className="rounded-lg object-contain md:hidden" />
            </div>
            
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 md:gap-3">
              <span className="text-base md:text-xl font-black text-brand-600 tracking-tight uppercase max-w-[200px] md:max-w-[300px] truncate">{liveGymName || 'GymFlow'}</span>
            </div>
            <AccountMenu 
              initialEmail={initialUser?.email} 
              initialGymId={initialGym?.id}
              initialGymName={liveGymName}
              initialUnreadCount={initialUnreadCount} 
            />
          </div>
        </header>

        {/* Subscription banner — shown between header and main content when
            the subscription is on trial, expiring soon, or already expired.
            Uses live state so the banner updates in real-time without a page reload. */}
        {(liveSubStatus === 'trial' || liveSubStatus === 'expiring' || liveSubStatus === 'expired') && (
          <TrialBanner
            mode={liveSubStatus === 'expiring' ? 'expiring' : liveSubStatus === 'expired' ? 'expired' : 'trial'}
            daysLeft={liveDaysLeft}
          />
        )}

        <main className="flex-1 w-full bg-slate-50 min-w-0">
          <div className="w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile nav ── */}
      <MobileNav />
    </div>
  )
}
