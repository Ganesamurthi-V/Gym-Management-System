'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Building2, ScrollText, Bug,
  HeadphonesIcon, LogOut, Shield, ChevronRight
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/gyms', label: 'Gyms', icon: Building2 },
  { href: '/logs', label: 'Event Logs', icon: ScrollText },
  { href: '/errors', label: 'Errors', icon: Bug },
  { href: '/support', label: 'Support', icon: HeadphonesIcon },
]

// Poll interval in ms — no realtime needed, lightweight polling is sufficient
const POLL_INTERVAL = 30_000

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [openTicketsCount, setOpenTicketsCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function fetchTicketCount() {
    try {
      const res = await fetch('/api/support/ticket-count')
      if (!res.ok) return
      const data = await res.json()
      setOpenTicketsCount(data.count ?? 0)
    } catch {
      // Silently fail — non-critical UI badge
    }
  }

  useEffect(() => {
    fetchTicketCount()
    timerRef.current = setInterval(fetchTicketCount, POLL_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/auth')
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-[#0d1424] border-r border-[#1f2937] flex flex-col z-30">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-[#1f2937]">
        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">GymFlow</p>
          <p className="text-[10px] text-indigo-400 font-medium uppercase tracking-widest mt-0.5">Super Admin</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                active
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="flex-1">{label}</span>
              {href === '/support' && openTicketsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400 text-[10px] font-bold">
                  {openTicketsCount > 99 ? '99+' : openTicketsCount}
                </span>
              )}
              {active && href !== '/support' && <ChevronRight className="w-3 h-3 ml-auto text-indigo-400" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-[#1f2937]">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white">SA</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">Super Admin</p>
            <p className="text-[10px] text-slate-500 truncate">GymFlow Admin Panel</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>
    </aside>
  )
}
