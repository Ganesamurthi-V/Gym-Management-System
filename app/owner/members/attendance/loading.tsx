import { ArrowLeft, Download, Search, Clock } from 'lucide-react'

export default function AttendanceLogLoading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-7xl mx-auto animate-pulse">
      {/* Page Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-slate-300">
            <ArrowLeft className="w-4 h-4" />Back to Members
          </div>
          <span className="text-slate-200">/</span>
          <div className="h-8 w-48 bg-slate-200 rounded-lg"></div>
        </div>
        <div className="h-9 w-24 bg-slate-200 rounded-lg"></div>
      </div>

      {/* Filters Toolbar Skeleton */}
      <div className="card p-3 md:p-4 flex flex-wrap gap-4 items-center w-full">
        <div className="flex flex-wrap items-center gap-3 w-full">
          <div className="relative w-full sm:w-64">
            <div className="h-[34px] w-full bg-slate-100 rounded-xl border border-slate-200"></div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-[34px] w-64 bg-slate-100 rounded-xl"></div>
          </div>

          <div className="h-[34px] w-48 bg-slate-100 rounded-xl"></div>
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Member</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Session</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Check In</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Check Out</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Duration</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-3 px-4">
                    <div className="h-5 w-24 bg-slate-100 rounded"></div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="h-4 w-32 bg-slate-100 rounded"></div>
                      <div className="h-3 w-16 bg-slate-50 rounded"></div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-20 bg-slate-100 rounded"></div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-20 bg-slate-100 rounded"></div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-16 bg-slate-100 rounded"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
