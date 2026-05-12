import { FitnessLoader } from '@/components/ui/FitnessLoader'

export default function MembersLoading() {
  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-32" />
        <div className="flex gap-2">
          <div className="skeleton h-10 w-24 rounded-xl" />
          <div className="skeleton h-10 w-32 rounded-xl" />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="skeleton h-11 flex-1 rounded-xl" />
        <div className="skeleton h-11 w-full md:w-48 rounded-xl" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {[100, 80, 100, 90, 110].map((w, i) => (
          <div key={i} className="skeleton h-9 rounded-full flex-shrink-0" style={{ width: w }} />
        ))}
      </div>

      <div className="card overflow-hidden">
        <FitnessLoader />
      </div>
    </div>
  )
}
