import { getSentryEvents } from '@/lib/sentry-api'
import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { Badge } from '@/components/ui/badge'
import { LogsTable, type LogRow } from './_components/logs-table'

export default async function LogsPage() {
  const events = await getSentryEvents(50).catch(() => [])

  const rows: LogRow[] = events.map((e) => ({
    id: e.id,
    level: e.level,
    title: e.title,
    culprit: e.culprit,
    page: e.tags?.find((t) => t.key === 'page')?.value ?? 'unknown',
    time: new Date(e.dateCreated).toLocaleString('en-IN'),
  }))

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageToolbar title="Event Logs" description="Live stream of all Sentry events">
        <Badge variant="outline">{events.length} latest</Badge>
      </PageToolbar>
      <LogsTable data={rows} />
    </div>
  )
}
