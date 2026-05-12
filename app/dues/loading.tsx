import { FitnessLoader } from '@/components/ui/FitnessLoader'

export default function DuesLoading() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-8 w-40" />
        </div>
        <div className="skeleton h-10 w-48 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6 space-y-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-10 w-48" />
        </div>
        <div className="card p-6 space-y-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-10 w-48" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <FitnessLoader />
      </div>
    </div>
  )
}
