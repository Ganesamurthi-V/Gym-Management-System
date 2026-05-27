'use client'

import { Dumbbell, Activity } from 'lucide-react'
import { useEffect, useState } from 'react'

export function FitnessLoader() {
  const [loadingText, setLoadingText] = useState('Warming up...')

  useEffect(() => {
    const texts = ['Warming up...', 'Lifting data...', 'Getting reps in...', 'Almost ready...']
    let i = 0
    const interval = setInterval(() => {
      i = (i + 1) % texts.length
      setLoadingText(texts[i])
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-50/40 backdrop-blur-md rounded-xl">
      <div className="relative flex items-center justify-center mb-6">
        {/* Outer glowing rings */}
        <div className="absolute w-24 h-24 border-4 border-brand-100 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
        <div className="absolute w-20 h-20 border-4 border-cyan-100 rounded-full animate-[spin_3s_linear_infinite] border-t-cyan-500" />
        
        {/* Inner circle with icon */}
        <div className="relative z-10 w-16 h-16 bg-gradient-to-br from-brand-500 to-cyan-500 rounded-full flex items-center justify-center shadow-lg shadow-brand-200 animate-pulse-soft">
          <Dumbbell className="w-8 h-8 text-white animate-lift" />
        </div>
        
        {/* Heartbeat accent */}
        <Activity className="absolute -bottom-2 -right-2 w-6 h-6 text-brand-600 animate-bounce-dot" />
      </div>

      <div className="flex flex-col items-center gap-2">
        <h3 className="text-xl font-bold text-slate-800 tracking-tight">GymDesk</h3>
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest animate-pulse">
          {loadingText}
        </p>
      </div>
    </div>
  )
}
