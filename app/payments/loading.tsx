import { FitnessLoader } from '@/components/ui/FitnessLoader'

export default function PaymentsLoading() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-10 w-32 rounded-xl" />
      </div>

      <div className="card overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex gap-4">
          <div className="skeleton h-10 flex-1 rounded-xl" />
          <div className="skeleton h-10 w-32 rounded-xl" />
        </div>
        <FitnessLoader />
      </div>
    </div>
  )
}
