import { Dumbbell } from 'lucide-react'

export function FitnessLoader() {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-brand-100 rounded-full animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center animate-lift">
          <Dumbbell className="w-8 h-8 text-brand-500" />
        </div>
      </div>
      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse-soft">
        GymFlow Loading...
      </p>
    </div>
  )
}
