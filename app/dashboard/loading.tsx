import { FitnessLoader } from '@/components/ui/FitnessLoader'

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-8 w-40" />
        </div>
        <div className="skeleton h-10 w-24 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="skeleton h-8 w-8 rounded-xl" />
            <div className="skeleton h-8 w-12" />
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-5 space-y-4">
          <div className="skeleton h-4 w-32" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </div>
        <div className="card md:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="skeleton h-5 w-48" />
            <div className="skeleton h-8 w-32 rounded-lg" />
          </div>
          <FitnessLoader />
        </div>
      </div>
    </div>
  )
}
