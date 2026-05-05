import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'GymFlow — Gym Management',
  description: 'Simple gym management for Indian gyms',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#171717',
}

// ── Nav items ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Dashboard',  href: '/',          icon: SquaresIcon },
  { label: 'Members',    href: '/members',    icon: UsersIcon },
  { label: 'Plans',      href: '/plans',      icon: TagIcon },
  { label: 'Payments',   href: '/payments',   icon: RupeeIcon },
  { label: 'Reports',    href: '/reports',    icon: ChartIcon },
  { label: 'Settings',   href: '/settings',   icon: GearIcon },
] as const

// ── Root Layout ────────────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`
          ${inter.variable} font-sans antialiased h-full
          bg-neutral-50 text-neutral-900
        `}
      >
        {/* ── Top Navbar ── */}
        <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-neutral-200 bg-white">
          <div className="flex h-full items-center justify-between px-5">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 select-none">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900">
                <DumbbellIcon className="h-4 w-4 text-white" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
                GymFlow
              </span>
            </Link>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-0.5">
              {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium
                             text-neutral-500 transition-colors
                             hover:bg-neutral-100 hover:text-neutral-900
                             aria-[current=page]:bg-neutral-100 aria-[current=page]:text-neutral-900"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2.5">
              {/* Add member CTA */}
              <Link
                href="/members/new"
                className="hidden sm:flex items-center gap-1.5 rounded-md border border-neutral-200
                           bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white
                           transition-colors hover:bg-neutral-700"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add Member
              </Link>

              {/* Notification bell */}
              <button
                type="button"
                aria-label="Notifications"
                className="relative flex h-8 w-8 items-center justify-center rounded-full
                           border border-neutral-200 bg-white text-neutral-500
                           hover:bg-neutral-50 transition-colors"
              >
                <BellIcon className="h-4 w-4" />
                {/* Unread dot */}
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-orange-500" />
              </button>

              {/* Avatar */}
              <button
                type="button"
                aria-label="Profile"
                className="flex h-8 w-8 items-center justify-center rounded-full
                           border border-neutral-200 bg-neutral-100
                           text-[11px] font-semibold text-neutral-600
                           hover:bg-neutral-200 transition-colors"
              >
                AK
              </button>
            </div>
          </div>
        </header>

        {/* ── Page body (offset for navbar) ── */}
        <div className="pt-14 min-h-full">
          <main className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>

        {/* ── Mobile bottom nav ── */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex md:hidden
                        border-t border-neutral-200 bg-white">
          {NAV_ITEMS.slice(0, 5).map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium
                         text-neutral-400 hover:text-neutral-900 transition-colors"
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </nav>
      </body>
    </html>
  )
}

// ── Inline SVG icons (no external dep) ────────────────────────────────────────

function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="1"   y="6.5" width="2.5" height="3"   rx="0.5" />
      <rect x="12.5" y="6.5" width="2.5" height="3"  rx="0.5" />
      <rect x="3.5" y="5"   width="2"   height="6"   rx="0.5" />
      <rect x="10.5" y="5"  width="2"   height="6"   rx="0.5" />
      <rect x="5.5" y="7"   width="5"   height="2"   rx="0.5" />
    </svg>
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

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z" strokeLinejoin="round" />
      <circle cx="5" cy="5" r="1" fill="currentColor" stroke="none" />
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

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12.5 6 8l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3 1 4 1 4H2.5s1-1 1-4A4.5 4.5 0 0 1 8 1.5z" />
      <path d="M6.5 13a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
    </svg>
  )
}