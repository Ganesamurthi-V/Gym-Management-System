'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

/**
 * Decides whether the admin chrome (sidebar + offset main column) wraps the page.
 *
 * Why this is a client component keyed on the pathname, not just the server session:
 *
 * The root layout is a server component and used to render the shell whenever a valid
 * session cookie existed. That produced two visible bugs:
 *
 *   1. The sidebar showed on top of the /auth login form. /auth is a public path, so an
 *      already-authenticated visitor who lands there still has a cookie, and the layout
 *      drew the shell over the login screen.
 *
 *   2. The shell got out of sync with client navigation. Login and logout both use
 *      router.push(), a client-side transition that does NOT re-run the server layout,
 *      so the sidebar lingered after logout and was missing right after login until a
 *      hard refresh.
 *
 * Keying the shell on usePathname() fixes both: /auth never gets the shell regardless of
 * cookie state, and because pathname is reactive, moving between /auth and the app
 * re-evaluates on the client without a reload. Whether the user is actually allowed to
 * see a protected page is still enforced server-side by middleware.ts — this component
 * only decides layout, never access.
 */

// Routes that render without the admin chrome. Kept in sync with PUBLIC_PATHS in
// middleware.ts: anything the middleware lets through unauthenticated must also be able
// to render without the sidebar.
const BARE_ROUTES = ['/auth']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isBare = BARE_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (isBare) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 min-h-screen bg-[#0a0f1e]">
        <div className="p-6 md:p-8 max-w-7xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
