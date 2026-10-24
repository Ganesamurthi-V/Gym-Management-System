import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { MemberShell } from '@/components/member/MemberShell'
import { SessionLifecycle } from '@/components/member/SessionLifecycle'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { getMemberWithGym, getMemberAppAccess } from '@/lib/member/member-data'
import { getAuthUser } from '@/lib/dal'
import { roleFromClaims } from '@/lib/auth/roles'
import { OWNER_HOME } from '@/lib/protected-routes'

/**
 * Member experience layout — also the authorization boundary for every
 * `/m/*` route.
 *
 * The middleware verifies the JWT signature locally (~1ms) and enforces the
 * role claim, but it no longer asks the database whether the user is a linked
 * member, because that cost a serial ~300ms round trip on every navigation.
 * That check happens here instead, where the member row is being loaded anyway.
 *
 * `getMemberWithGym()` is wrapped in React `cache()`, so this call and the one
 * inside the page below it share a single database round trip — the check is
 * free.
 *
 * A signed-in user who is not a linked member is sent back to login with the
 * same `error=not_member` signal the middleware used to produce. Middleware
 * clears the stale session when it sees that state on `/auth/*`, so this cannot
 * loop: it declines to bounce non-members back to /m/home.
 *
 * `QueryProvider` and `SessionLifecycle` live here rather than in the root
 * layout so the owner console does not pay for TanStack Query in its bundle.
 */
export const metadata: Metadata = {
  applicationName: 'GymFlow Member',
  title: {
    default: 'GymFlow Member',
    template: '%s — GymFlow Member',
  },
  description: 'Your gym membership, workouts, and progress — all in one place.',
  manifest: '/manifest-member.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GymFlow',
  },
  formatDetection: { telephone: false },
  // Every /m/* route is a member's private data. `robots.ts` disallows /m/;
  // this is the directive that guarantees exclusion from the index.
  robots: {
    index: false,
    follow: false,
  },
}

/**
 * `viewportFit: 'cover'` is scoped to the member subtree on purpose. The member
 * shell pads itself with `env(safe-area-inset-*)`, so drawing edge-to-edge is
 * correct there. The owner console has a sticky header pinned to `top-0` that
 * would slide under the status bar in standalone mode, so it keeps the default.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Theme-aware browser chrome; colorScheme is set at runtime by the app's
  // ThemeProvider on <html>, so it must not be hard-locked to light here.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563EB' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default async function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const data = await getMemberWithGym()

  if (!data) {
    /**
     * Two very different situations land here, so they get different exits.
     * Both extra reads happen ONLY on this failure path, so the happy path
     * still costs exactly one database round trip.
     */
    const { user } = await getAuthUser()

    // A gym owner who reached a member URL — send them to their own console
    // rather than to a login page that would look broken to them.
    if (user && roleFromClaims(user) !== 'member') redirect(OWNER_HOME)

    // A genuinely unlinked account: back to login, which clears the session.
    redirect('/auth/login?role=member&error=not_member')
  }

  // Plan gate: Free gyms have no member app and trial gyms cover their first 50 members. Checked
  // here, the authorization boundary, so every /m/* route is covered. Fresh read, fails closed.
  if (!(await getMemberAppAccess(data.member))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            Member app is not available on your gym&apos;s plan
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Please ask your gym owner to upgrade the plan to use the member app.
          </p>
        </div>
      </main>
    )
  }

  return (
    <QueryProvider>
      <SessionLifecycle />
      <MemberShell>{children}</MemberShell>
    </QueryProvider>
  )
}
