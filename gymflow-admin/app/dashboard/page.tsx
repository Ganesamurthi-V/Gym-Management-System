import { createAdminClient } from '@/lib/supabase-admin'
import { getSentryIssues } from '@/lib/sentry-api'
import { Building2, Users, AlertTriangle, Bug, ShieldCheck, Activity } from 'lucide-react'
import Link from 'next/link'
import ResolveButton from '@/components/errors/ResolveButton'
import { MetricCards } from '@/components/dashboard/metric-cards'
import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { StatusBadge, type StatusTone } from '@/components/dashboard/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export const dynamic = 'force-dynamic'

const MSG_TONE: Record<string, StatusTone> = { error: 'error', warning: 'warning', success: 'success' }

export default async function DashboardPage() {
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

  const gymCount = (results[0] as any)?.count
  const memberCount = (results[1] as any)?.count
  const attendanceToday = (results[2] as any)?.count
  const sentryErrors = results[3]
  const sentryWarnings = results[4]
  const recentMessages = results[5]

  const errors = Array.isArray(sentryErrors) ? sentryErrors : []
  const warnings = Array.isArray(sentryWarnings) ? sentryWarnings : []
  const recentMsgs = (recentMessages as any)?.data ?? []
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageToolbar title="Dashboard" description={today} />

      <MetricCards
        className="xl:grid-cols-3"
        items={[
          { icon: Building2, label: 'Total Gyms', value: String(gymCount ?? '—') },
          { icon: Users, label: 'Total Members', value: String(memberCount ?? '—') },
          { icon: Activity, label: "Today's Attendance", value: String((attendanceToday as any)?.count ?? '—') },
          {
            icon: Bug,
            label: 'Open Errors',
            value: String(errors.length),
            footnote: 'Unresolved in Sentry',
            href: '/errors',
            badge: errors.length > 0 ? { text: 'Needs attention', variant: 'destructive' } : undefined,
          },
          {
            icon: AlertTriangle,
            label: 'Warnings',
            value: String(warnings.length),
            footnote: 'Unresolved in Sentry',
            badge: warnings.length > 0 ? { text: 'Review', variant: 'secondary' } : undefined,
          },
          { icon: ShieldCheck, label: 'Messages Sent', value: String(recentMsgs.length), footnote: 'Recent support msgs', href: '/support' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent errors</CardTitle>
            <CardDescription>Latest unresolved errors from Sentry</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" asChild>
                <Link href="/errors">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {errors.slice(0, 5).length === 0 ? (
              <p className="text-muted-foreground text-sm">No open errors</p>
            ) : (
              errors.slice(0, 5).map((e: any, i: number) => (
                <div key={e.id} className="flex flex-col gap-3">
                  {i > 0 && <Separator />}
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid min-w-0 gap-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <StatusBadge tone="error">error</StatusBadge>
                        <p className="truncate text-sm font-medium" title={e.title}>{e.title}</p>
                      </div>
                      <p className="text-muted-foreground truncate text-xs">{e.culprit}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(e.lastSeen).toLocaleString('en-IN')} · {e.count} events
                      </p>
                    </div>
                    <ResolveButton issueId={e.id} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent messages</CardTitle>
            <CardDescription>Latest support messages sent to gyms</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" asChild>
                <Link href="/support">Send message</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {recentMsgs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No messages sent yet</p>
            ) : (
              recentMsgs.map((m: any, i: number) => (
                <div key={m.id} className="flex flex-col gap-3">
                  {i > 0 && <Separator />}
                  <div className="grid gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">{m.subject}</p>
                      <StatusBadge tone={MSG_TONE[m.type] ?? 'info'}>{m.type}</StatusBadge>
                    </div>
                    <p className="text-muted-foreground text-xs">{m.gym?.name ?? 'Unknown gym'}</p>
                    <p className="text-muted-foreground text-xs">{new Date(m.created_at).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
