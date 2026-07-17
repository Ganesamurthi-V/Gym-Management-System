import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { getSentryIssues } from '@/lib/sentry-api'

export const dynamic = 'force-dynamic'

// GET /api/dashboard — aggregated dashboard stats for the mobile app
export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const results = await Promise.allSettled([
    supabase.from('gyms').select('*', { count: 'exact', head: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('attendance').select('*', { count: 'exact', head: true })
      .eq('date', new Date().toISOString().slice(0, 10)),
    getSentryIssues('level:error is:unresolved', 25),
    getSentryIssues('level:warning is:unresolved', 25),
    supabase.from('admin_messages').select('*, gym:gym_id(name)').order('created_at', { ascending: false }).limit(5),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null))

  const gymCount = (results[0] as any)?.count ?? 0
  const memberCount = (results[1] as any)?.count ?? 0
  const attendanceToday = (results[2] as any)?.count ?? 0
  const sentryErrors = Array.isArray(results[3]) ? results[3] : []
  const sentryWarnings = Array.isArray(results[4]) ? results[4] : []
  const recentMessages = (results[5] as any)?.data ?? []

  const recentErrors = sentryErrors.slice(0, 5).map((e: any) => ({
    id: e.id,
    title: e.title,
    culprit: e.culprit,
    count: e.count,
    lastSeen: e.lastSeen,
  }))

  return NextResponse.json({
    gymCount,
    memberCount,
    attendanceToday,
    errorCount: sentryErrors.length,
    warningCount: sentryWarnings.length,
    recentErrors,
    recentMessages,
  })
}
