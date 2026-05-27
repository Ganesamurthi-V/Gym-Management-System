'use client'

import { useState, useEffect } from 'react'

interface WelcomeTransitionProps {
  userName?: string
  title?: React.ReactNode
  subtitle?: string
}

export function WelcomeTransition({ userName, title, subtitle }: WelcomeTransitionProps) {
  const [stage, setStage] = useState(0) // 0=initial, 1=checkmark, 2=text, 3=progress

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 200)   // show checkmark
    const t2 = setTimeout(() => setStage(2), 800)   // show text
    const t3 = setTimeout(() => setStage(3), 1400)  // show progress bar
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B0F1A] flex items-center justify-center overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[150px] animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-emerald-500/8 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />

      {/* Floating sparkles */}
      {Array.from({ length: 30 }).map((_, i) => {
        const r1 = Math.abs((Math.sin(i + 1) * 10000) % 1)
        const r2 = Math.abs((Math.sin(i + 2) * 10000) % 1)
        const r3 = Math.abs((Math.sin(i + 3) * 10000) % 1)
        const r4 = Math.abs((Math.sin(i + 4) * 10000) % 1)
        const r5 = Math.abs((Math.sin(i + 5) * 10000) % 1)
        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${(2 + r1 * 3).toFixed(2)}px`,
              height: `${(2 + r1 * 3).toFixed(2)}px`,
              background: ['#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#a855f7'][i % 5],
              left: `${(r2 * 100).toFixed(2)}%`,
              top: `${(r3 * 100).toFixed(2)}%`,
              opacity: 0,
              animation: `sparkle-float ${(3 + r4 * 4).toFixed(2)}s ease-in-out ${(r5 * 2).toFixed(2)}s infinite`,
            }}
          />
        )
      })}

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-md">
        {/* Animated Checkmark Circle */}
        <div className={`relative mb-8 transition-all duration-700 ease-out ${stage >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          {/* Outer ring pulse */}
          <div className={`absolute inset-[-12px] rounded-full border-2 border-emerald-400/20 transition-all duration-1000 ${stage >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} style={{ animation: stage >= 1 ? 'ring-pulse 2s ease-out infinite' : 'none' }} />
          <div className={`absolute inset-[-24px] rounded-full border border-emerald-400/10 transition-all duration-1000 delay-200 ${stage >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} style={{ animation: stage >= 1 ? 'ring-pulse 2s ease-out 0.5s infinite' : 'none' }} />

          {/* Main circle */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path
                d="M5 13l4 4L19 7"
                className={stage >= 1 ? 'animate-check-draw' : ''}
                style={{
                  strokeDasharray: 24,
                  strokeDashoffset: stage >= 1 ? 0 : 24,
                  transition: 'stroke-dashoffset 0.6s ease-out 0.3s',
                }}
              />
            </svg>
          </div>
        </div>

        {/* Welcome text */}
        <div className={`space-y-3 transition-all duration-700 ${stage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          {title ? (
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              {title}
            </h1>
          ) : (
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              Welcome back{userName ? ',' : '!'}<br />
              {userName && <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-cyan-400 bg-clip-text text-transparent">{userName}</span>}
            </h1>
          )}
          <p className="text-white/40 text-sm font-medium">
            {subtitle || "You're all set! Taking you to your dashboard..."}
          </p>
        </div>

        {/* Progress bar */}
        <div className={`w-full max-w-[240px] mt-8 transition-all duration-500 ${stage >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-400 via-emerald-400 to-cyan-400 rounded-full"
              style={{
                width: stage >= 3 ? '100%' : '0%',
                transition: 'width 1.8s cubic-bezier(0.22, 0.61, 0.36, 1)',
              }}
            />
          </div>
          <div className={`flex items-center justify-center gap-2 mt-4 transition-all duration-500 delay-300 ${stage >= 3 ? 'opacity-100' : 'opacity-0'}`}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold text-white/25 uppercase tracking-widest">Loading your gym</span>
          </div>
        </div>
      </div>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes sparkle-float {
          0%, 100% { opacity: 0; transform: translateY(0) scale(0.5); }
          20% { opacity: 0.7; transform: translateY(-30px) scale(1); }
          80% { opacity: 0.3; transform: translateY(-60px) scale(0.8); }
        }
        @keyframes ring-pulse {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes check-draw {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
        .animate-check-draw {
          animation: check-draw 0.6s ease-out 0.3s forwards;
          stroke-dashoffset: 24;
        }
      `}</style>
    </div>
  )
}
