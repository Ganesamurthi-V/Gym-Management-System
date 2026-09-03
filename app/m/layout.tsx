import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { MemberShell } from '@/components/member/MemberShell'
import { SessionLifecycle } from '@/components/member/SessionLifecycle'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { getMemberWithGym } from '@/lib/member/member-data'
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
  icons: {
    icon: '/logo_only.png',
    apple: '/logo_only.png',
  },
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
  themeColor: '#2563EB',
  colorScheme: 'light',
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

  return (
    <QueryProvider>
      <SessionLifecycle />
      <MemberShell>{children}</MemberShell>
    </QueryProvider>
  )
}
