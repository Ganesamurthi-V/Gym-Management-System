'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { X, Menu } from 'lucide-react'

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',   icon: SquaresIcon },
  { label: 'Members',    href: '/members',      icon: UsersIcon },
  { label: 'Payments',   href: '/payments',     icon: RupeeIcon },
  { label: 'Dues',       href: '/dues',         icon: AlertIcon },
  { label: 'Attendance', href: '/attendance',   icon: CalendarIcon },
  { label: 'Inventory',  href: '/inventory',    icon: BoxIcon },
  { label: 'Programs',   href: '#', icon: ActivityIcon, comingSoon: true },
  { label: 'Reports',    href: '#',      icon: ChartIcon, comingSoon: true },
]

// ── Desktop sidebar nav ───────────────────────────────────────────────────────
export function DesktopNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
      {NAV_ITEMS.map(({ label, href, icon: Icon, comingSoon }) => {
        const active = isActive(href) && !comingSoon
        return (
          <Link
            key={label}
            href={href}
            onClick={e => {
              e.stopPropagation()
              if (comingSoon) e.preventDefault()
            }}
            title={collapsed ? label : undefined}
            className={`
              flex items-center rounded-xl text-sm font-medium transition-all group
              ${collapsed ? 'justify-center px-0 py-3 mx-1 group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3 group-hover/sidebar:py-2.5 group-hover/sidebar:mx-0' : 'gap-3 px-3 py-2.5'}
              ${active
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
            `}
          >
            {/* Icon — always visible */}
            <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${
              active ? 'text-brand-600' : 'text-slate-400 group-hover:text-brand-500'
            }`} />

            {/* Label — fades out when collapsed */}
            <span className={`
              whitespace-nowrap overflow-hidden transition-all duration-200 flex items-center gap-2
              ${collapsed ? 'w-0 opacity-0 group-hover/sidebar:w-auto group-hover/sidebar:opacity-100 group-hover/sidebar:flex-1' : 'flex-1 opacity-100'}
            `}>
              {label}
              {comingSoon && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 uppercase tracking-wider border border-amber-200/50 ${collapsed ? 'hidden group-hover/sidebar:inline-block' : 'inline-block'}`}>
                  Soon
                </span>
              )}
            </span>

            {/* Active dot — only when expanded */}
            {active && !collapsed && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}

// ── Mobile hamburger + slide-up drawer ───────────────────────────────────────
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const current = NAV_ITEMS.find(n => isActive(n.href))

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const mobileNavContent = open ? (
    <>
      <div
        className="md:hidden fixed inset-0 bg-slate-900/40 z-[9998] backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className={`md:hidden fixed bottom-0 inset-x-0 z-[9999] bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Menu</span>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="px-3 py-3 space-y-1">
          {NAV_ITEMS.map(({ label, href, icon: Icon, comingSoon }) => {
            const active = isActive(href) && !comingSoon
            return (
              <Link
                key={label}
                href={href}
                onClick={(e) => {
                  if (comingSoon) {
                    e.preventDefault()
                  } else {
                    setOpen(false)
                  }
                }}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all ${
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  active ? 'bg-brand-100' : 'bg-slate-100'
                }`}>
                  <Icon className={`w-4 h-4 ${active ? 'text-brand-600' : 'text-slate-500'}`} />
                </div>
                <span>{label}</span>
                {comingSoon && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 uppercase tracking-wider border border-amber-200/50">
                    Soon
                  </span>
                )}
                {active && !comingSoon && <span className="ml-auto w-2 h-2 rounded-full bg-brand-500" />}
              </Link>
            )
          })}
        </nav>
        <div className="px-4 pb-6 pt-2">
          <Link
            href="/members/new"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold rounded-2xl shadow-sm active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            Add Member
          </Link>
        </div>
      </div>
    </>
  ) : null

  return (
    <>
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex items-center justify-between px-5 h-16">
        <div className="flex items-center gap-2.5">
          {current && (
            <>
              <current.icon className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-bold text-slate-800">{current.label}</span>
            </>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 active:bg-slate-200 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {mounted && typeof document !== 'undefined' && createPortal(mobileNavContent, document.body)}
    </>
  )
}

// ── Default export ────────────────────────────────────────────────────────────
export default function NavClient({ collapsed = false }: { collapsed?: boolean }) {
  return <DesktopNav collapsed={collapsed} />
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SquaresIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
      <rect x="9"   y="1.5" width="5.5" height="5.5" rx="1" />
      <rect x="1.5" y="9"   width="5.5" height="5.5" rx="1" />
      <rect x="9"   y="9"   width="5.5" height="5.5" rx="1" />
    </svg>
  )
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 13.5c0-2.485 2.239-4.5 5-4.5s5 2.015 5 4.5" strokeLinecap="round" />
      <path d="M11 7.5a2 2 0 1 0 0-4M15 13.5c0-2.071-1.5-3.8-3.5-4.35" strokeLinecap="round" />
    </svg>
  )
}
function RupeeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 3h8M4 6.5h8M4 6.5c0 3.5 2.5 5.5 5.5 5.5" strokeLinecap="round" />
      <path d="M7 6.5 4 13" strokeLinecap="round" />
    </svg>
  )
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
      <path d="M1.5 6.5h13M5 1v3M11 1v3" strokeLinecap="round" />
    </svg>
  )
}
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12.5 6 8l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v3.5M8 10.5v.5" strokeLinecap="round" />
    </svg>
  )
}
function BoxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2L2 5l6 3 6-3-6-3z" strokeLinejoin="round" />
      <path d="M2 5v6l6 3 6-3V5M8 8v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 8h-3l-2.5 5.5L4 2 2.5 8H1" />
    </svg>
  )
}
