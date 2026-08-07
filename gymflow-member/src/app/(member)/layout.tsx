import { redirect } from 'next/navigation'
import { MemberShell } from '@/components/layout/MemberShell'
import { getMemberWithGym } from '@/lib/member-data'

/**
 * Authorization boundary for every member route.
 *
 * The middleware verifies the JWT signature locally (0ms) but no longer asks
 * the database whether the user is a linked member, because that cost a serial
 * ~300ms round trip on every navigation. That check happens here instead, where
 * the member row is being loaded anyway.
 *
 * `getMemberWithGym()` is wrapped in React `cache()`, so this call and the one
 * inside the page below it share a single database round trip — the check is
 * free.
 *
 * A signed-in user who is not a linked member is sent back to login with the
 * same `error=not_member` signal the middleware used to produce. Middleware
 * clears the stale session when it sees that state on `/auth/*`, so this cannot
 * loop: it declines to bounce non-members back to /home.
 */
export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const data = await getMemberWithGym()
  if (!data) redirect('/auth/login?error=not_member')

  return <MemberShell>{children}</MemberShell>
}
