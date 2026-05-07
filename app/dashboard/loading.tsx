export default function DashboardLoading() {
  return (
    <div className="space-y-4 md:space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-8 w-36 bg-gray-200 rounded-lg" />
        </div>
        <div className="h-9 w-20 bg-gray-200 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="card p-4 md:p-5">
            <div className="w-9 h-9 bg-gray-200 rounded-xl mb-3" />
            <div className="h-8 w-12 bg-gray-200 rounded mb-1.5" />
            <div className="h-3 w-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="card p-5 space-y-3">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="card md:col-span-2">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="h-5 w-40 bg-gray-200 rounded" />
          </div>
          {[1,2,3,4].map(i => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50">
              <div className="w-8 h-8 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-gray-200 rounded w-32" />
                <div className="h-3 bg-gray-100 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
