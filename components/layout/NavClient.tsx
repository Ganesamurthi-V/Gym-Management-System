'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV_ITEMS = [
  { label: 'Dashboard',  href: '/dashboard',   icon: SquaresIcon },
  { label: 'Members',    href: '/members',      icon: UsersIcon },
  { label: 'Payments',   href: '/payments',     icon: RupeeIcon },
  { label: 'Dues',       href: '/dues',         icon: AlertIcon },
  { label: 'Attendance', href: '/attendance',   icon: CalendarIcon },
  { label: 'Reports',    href: '/reports',      icon: ChartIcon },
] as const

export default function NavClient() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Desktop Sidebar nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
              isActive(href) ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 ${isActive(href) ? 'text-brand-600' : 'group-hover:text-brand-600'}`} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex">
        {NAV_ITEMS.slice(0, 6).map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors ${
              isActive(href) ? 'text-brand-600' : 'text-gray-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}

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
