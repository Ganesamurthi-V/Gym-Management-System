import { FitnessLoader } from '@/components/ui/FitnessLoader'

export default function AttendanceLoading() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-8 w-48" />
        </div>
        <div className="skeleton h-10 w-40 rounded-xl" />
      </div>

      <div className="card overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="skeleton h-11 w-full rounded-xl" />
        </div>
        <FitnessLoader />
      </div>
    </div>
  )
}
