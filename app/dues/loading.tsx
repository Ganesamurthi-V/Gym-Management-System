export default function DuesLoading() {
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-24" />
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <div className="skeleton w-4 h-4 rounded" />
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-5 w-16" />
          </div>
        </div>
      </div>

      {/* Dues list */}
      <div className="card overflow-hidden">
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-3">
              <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4 w-36" />
                <div className="skeleton h-3 w-24" />
              </div>
              <div className="space-y-1.5 text-right">
                <div className="skeleton h-5 w-16" />
                <div className="skeleton h-3 w-12" />
              </div>
              <div className="flex gap-1.5 ml-2">
                <div className="skeleton w-8 h-8 rounded-lg" />
                <div className="skeleton w-8 h-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
