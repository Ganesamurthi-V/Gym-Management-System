import { getSentryEvents } from '@/lib/sentry-api'
import { Bug, Info, AlertTriangle, ScrollText } from 'lucide-react'

export default async function LogsPage() {
  const events = await getSentryEvents(50).catch(() => [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Event Logs</h1>
          <p className="text-slate-500 text-sm mt-0.5">Live stream of all Sentry events</p>
        </div>
        <div className="admin-badge-info">{events.length} latest</div>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1f2937]">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Level</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Message</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Context</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2937]">
              {events.map((e) => {
                const isError = e.level === 'error' || e.level === 'fatal'
                const isWarning = e.level === 'warning'
                const page = e.tags?.find(t => t.key === 'page')?.value ?? 'unknown'

                return (
                  <tr key={e.id} className="admin-table-row">
                    <td className="px-5 py-3.5">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                        isError ? 'bg-red-500/10 text-red-400' :
                        isWarning ? 'bg-amber-500/10 text-amber-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>
                        {isError ? <Bug className="w-3 h-3" /> : isWarning ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                        {e.level}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-white max-w-md truncate" title={e.title}>{e.title}</p>
                      {e.culprit && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md" title={e.culprit}>{e.culprit}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/5">{page}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 text-xs">
                      {new Date(e.dateCreated).toLocaleString('en-IN')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {events.length === 0 && (
            <div className="py-16 text-center">
              <ScrollText className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500">No events found or check Sentry API config</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
