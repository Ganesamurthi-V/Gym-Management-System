export default function AttendanceLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-36 bg-gray-200 rounded-lg" />
          <div className="h-4 w-48 bg-gray-100 rounded" />
        </div>
        <div className="flex gap-2">
          {[1,2,3].map(i => <div key={i} className="card px-4 py-3 w-16 h-14" />)}
        </div>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full" />
      <div className="h-10 bg-gray-200 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="card p-3.5 flex items-center gap-3">
            <div className="w-6 h-6 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 rounded w-28" />
              <div className="h-3 bg-gray-100 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
