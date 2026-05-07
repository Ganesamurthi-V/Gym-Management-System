export default function PaymentsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-32 bg-gray-200 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1,2,3].map(i => (
          <div key={i} className="card p-5 space-y-2">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-8 w-32 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50">
            <div className="w-10 h-10 bg-gray-200 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 rounded w-36" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
            <div className="h-6 w-16 bg-gray-200 rounded-full" />
            <div className="h-5 w-20 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
