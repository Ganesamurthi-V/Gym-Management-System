import { FitnessLoader } from '@/components/ui/FitnessLoader'

export default function Loading() {
  return (
    <div className="relative h-full min-h-[600px] w-full animate-pulse-soft">
      {/* Background skeletons to blur out */}
      <div className="space-y-6 opacity-40">
        <div className="flex justify-between items-center mb-8">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="skeleton h-10 w-32 rounded-xl" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-6 h-32 skeleton" />
          <div className="card p-6 h-32 skeleton" />
          <div className="card p-6 h-32 skeleton" />
        </div>
        
        <div className="card p-6 h-96 skeleton w-full mt-6" />
      </div>

      {/* The glass blur overlay and creative animation */}
      <FitnessLoader />
    </div>
  )
}
