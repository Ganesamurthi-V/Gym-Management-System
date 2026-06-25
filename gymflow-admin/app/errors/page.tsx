import { getSentryIssues } from '@/lib/sentry-api'
import { Bug, ExternalLink, CheckCircle } from 'lucide-react'

export default async function ErrorsPage() {
  const issues = await getSentryIssues('level:error is:unresolved', 50).catch(() => [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Unresolved Errors</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track and resolve active system errors</p>
        </div>
        <div className="admin-badge-error">{issues.length} active</div>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1f2937]">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Issue</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Events</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">First Seen</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Seen</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2937]">
              {issues.map((issue) => (
                <tr key={issue.id} className="admin-table-row">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-red-400 max-w-md truncate" title={issue.title}>{issue.title}</p>
                    <p className="text-xs text-slate-400 mt-1 truncate max-w-md font-mono" title={issue.culprit}>{issue.culprit}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300">
                      {issue.count}
                    </div>
                    {issue.userCount > 0 && <span className="text-xs text-slate-500 ml-2">{issue.userCount} users</span>}
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs">
                    {new Date(issue.firstSeen).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs font-medium">
                    {new Date(issue.lastSeen).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <a 
                        href={issue.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-indigo-400 transition-colors"
                        title="View in Sentry"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {issues.length === 0 && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-bold text-white">All Clear!</h3>
              <p className="text-slate-500 mt-1">No unresolved errors found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
