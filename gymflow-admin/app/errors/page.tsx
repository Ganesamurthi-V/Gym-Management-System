import { getSentryIssues } from '@/lib/sentry-api'
import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { Badge } from '@/components/ui/badge'
import { ErrorsTable, type ErrorRow } from './_components/errors-table'

export default async function ErrorsPage() {
  const issues = await getSentryIssues('level:error is:unresolved', 50).catch(() => [])

  const rows: ErrorRow[] = issues.map((i) => ({
    id: i.id,
    title: i.title,
    culprit: i.culprit,
    count: i.count,
    userCount: i.userCount,
    firstSeen: new Date(i.firstSeen).toLocaleDateString('en-IN'),
    lastSeen: new Date(i.lastSeen).toLocaleString('en-IN'),
    permalink: i.permalink,
  }))

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageToolbar title="Unresolved Errors" description="Track and resolve active system errors">
        <Badge variant={issues.length > 0 ? 'destructive' : 'secondary'}>{issues.length} active</Badge>
      </PageToolbar>
      <ErrorsTable data={rows} />
    </div>
  )
}
