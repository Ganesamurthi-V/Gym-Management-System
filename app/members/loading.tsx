export default function MembersLoading() {
  return (
    <div className="space-y-4 md:space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-gray-200 rounded-lg" />
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-gray-200 rounded-lg" />
          <div className="h-9 w-28 bg-gray-200 rounded-lg" />
        </div>
      </div>
      <div className="h-10 bg-gray-200 rounded-xl" />
      <div className="flex gap-2">
        {[1,2,3,4].map(i => <div key={i} className="h-8 w-20 bg-gray-200 rounded-lg" />)}
      </div>
      <div className="card overflow-hidden">
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
            <div className="w-8 h-8 bg-gray-200 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 rounded w-40" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
            <div className="h-6 w-16 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
