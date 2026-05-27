'use client'

import type { DashboardStats } from '@/types'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  UserPlus, CalendarCheck, CreditCard, BarChart2, MessageCircle,
  Check, ChevronRight, X, Trophy, Sparkles, PartyPopper, Star
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Task {
  id: string
  title: string
  description: string
  icon: React.ElementType
  href: string
  color: string        // gradient from
  colorTo: string      // gradient to
  bgLight: string      // icon bg color
}

// ─── Constants ──────────────────────────────────────────────────────────────────

// (Keys are now generated dynamically per gym)

const TASKS: Task[] = [
  {
    id: 'add_member',
    title: 'Add your first member',
    description: 'Register a new gym member to get started',
    icon: UserPlus,
    href: '/members/new',
    color: 'from-brand-500',
    colorTo: 'to-brand-600',
    bgLight: 'bg-brand-50',
  },
  {
    id: 'mark_attendance',
    title: 'Mark attendance today',
    description: 'Log a member check-in for today',
    icon: CalendarCheck,
    href: '/attendance',
    color: 'from-cyan-500',
    colorTo: 'to-cyan-600',
    bgLight: 'bg-cyan-50',
  },
  {
    id: 'view_payments',
    title: 'Record a payment',
    description: 'Add a membership payment or fee',
    icon: CreditCard,
    href: '/payments',
    color: 'from-emerald-500',
    colorTo: 'to-emerald-600',
    bgLight: 'bg-emerald-50',
  },
  {
    id: 'check_reports',
    title: 'Explore your reports',
    description: 'View revenue, attendance and growth insights',
    icon: BarChart2,
    href: '/reports',
    color: 'from-violet-500',
    colorTo: 'to-violet-600',
    bgLight: 'bg-violet-50',
  },
  {
    id: 'send_reminder',
    title: 'Send a WhatsApp reminder',
    description: 'Remind an expiring member to renew',
    icon: MessageCircle,
    href: '/members?filter=expiring',
    color: 'from-amber-500',
    colorTo: 'to-amber-600',
    bgLight: 'bg-amber-50',
  },
]

// ─── Confetti Particle ──────────────────────────────────────────────────────────

interface Particle {
  id: number
  x: number
  y: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
  speedX: number
  speedY: number
  opacity: number
  shape: 'circle' | 'rect' | 'star'
}

const CONFETTI_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
  '#fbbf24', '#34d399', '#f472b6', '#818cf8',
]

let particleIdCounter = 0;

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    id: particleIdCounter++,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 10,
    size: Math.random() * 8 + 4,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 15,
    speedX: (Math.random() - 0.5) * 6,
    speedY: -(Math.random() * 4 + 2),
    opacity: 1,
    shape: (['circle', 'rect', 'star'] as const)[Math.floor(Math.random() * 3)],
  }))
}

// ─── Celebration Modal ──────────────────────────────────────────────────────────

function CelebrationModal({ onClose }: { onClose: () => void }) {
  const [particles, setParticles] = useState<Particle[]>([])
  const [show, setShow] = useState(false)
  const [burstPhase, setBurstPhase] = useState(0)
  const frameRef = useRef<number>(0)
  const startTime = useRef<number>(Date.now())

  useEffect(() => {
    // Start entrance animation
    requestAnimationFrame(() => setShow(true))

    // Generate confetti bursts
    setParticles(createParticles(80))
    startTime.current = Date.now()

    const burstTimer1 = setTimeout(() => {
      setBurstPhase(1)
      setParticles(prev => [...prev, ...createParticles(60)])
    }, 600)

    const burstTimer2 = setTimeout(() => {
      setBurstPhase(2)
      setParticles(prev => [...prev, ...createParticles(40)])
    }, 1200)

    return () => {
      clearTimeout(burstTimer1)
      clearTimeout(burstTimer2)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // Animate particles
  useEffect(() => {
    const animate = () => {
      const elapsed = (Date.now() - startTime.current) / 1000
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.speedX * 0.3,
            y: p.y + p.speedY * 0.3 + elapsed * 0.5,
            rotation: p.rotation + p.rotationSpeed,
            speedY: p.speedY + 0.08,
            opacity: Math.max(0, p.opacity - 0.004),
          }))
          .filter(p => p.opacity > 0 && p.y < 120)
      )
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const handleClose = () => {
    setShow(false)
    setTimeout(onClose, 300)
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300 ${show ? 'opacity-100' : 'opacity-0'
        }`}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'
        }`} />

      {/* Confetti Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.shape === 'circle' ? p.size : p.size * 0.7,
              height: p.shape === 'star' ? p.size : p.size * (p.shape === 'rect' ? 0.4 : 1),
              backgroundColor: p.color,
              borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'star' ? '2px' : '1px',
              transform: `rotate(${p.rotation}deg)`,
              opacity: p.opacity,
              transition: 'none',
            }}
          />
        ))}
      </div>

      {/* Modal Card */}
      <div
        className={`relative bg-white rounded-3xl shadow-2xl p-8 md:p-10 max-w-md mx-4 text-center transition-all duration-500 ${show
            ? 'scale-100 opacity-100 translate-y-0'
            : 'scale-75 opacity-0 translate-y-8'
          }`}
        onClick={e => e.stopPropagation()}
        style={{
          boxShadow: show
            ? '0 0 0 1px rgba(99,102,241,0.1), 0 25px 60px -12px rgba(99,102,241,0.25), 0 0 120px -30px rgba(168,85,247,0.2)'
            : undefined,
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>

        {/* Animated Trophy Icon */}
        <div className="relative mx-auto mb-6">
          {/* Glow rings */}
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ${show ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`}>
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-amber-200/30 to-yellow-200/30 animate-pulse" />
          </div>
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 delay-200 ${show ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`}>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-300/40 to-yellow-300/40 animate-pulse" style={{ animationDelay: '0.3s' }} />
          </div>
          {/* Trophy */}
          <div className={`relative w-20 h-20 mx-auto bg-gradient-to-br from-amber-400 to-yellow-500 rounded-2xl flex items-center justify-center transition-all duration-700 delay-300 ${show ? 'scale-100 rotate-0' : 'scale-0 rotate-45'
            }`}
            style={{
              boxShadow: '0 8px 32px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}
          >
            <Trophy className="w-10 h-10 text-white drop-shadow-sm" />
          </div>
          {/* Floating stars */}
          <Star className={`absolute -top-2 -right-2 w-6 h-6 text-amber-400 transition-all duration-500 delay-700 ${show ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`} style={{ animation: show ? 'float-star 2s ease-in-out infinite' : 'none' }} />
          <Sparkles className={`absolute -bottom-1 -left-3 w-5 h-5 text-violet-400 transition-all duration-500 delay-900 ${show ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`} style={{ animation: show ? 'float-star 2.5s ease-in-out infinite reverse' : 'none' }} />
          <PartyPopper className={`absolute top-0 -left-4 w-5 h-5 text-pink-400 transition-all duration-500 delay-[1100ms] ${show ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`} style={{ animation: show ? 'float-star 3s ease-in-out infinite' : 'none' }} />
        </div>

        {/* Text Content */}
        <div className={`transition-all duration-500 delay-500 ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">
            You&apos;re a Pro! 🎉
          </h2>
          <p className="text-slate-500 text-sm md:text-base leading-relaxed mb-6">
            You&apos;ve completed all the getting started tasks.<br />
            Your gym management journey is off to a <span className="font-bold text-brand-600">stellar start!</span>
          </p>
        </div>

        {/* Achievement Badge */}
        <div className={`inline-flex items-center gap-2 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200/60 rounded-full px-5 py-2.5 mb-6 transition-all duration-500 delay-700 ${show ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          }`}>
          <div className="w-6 h-6 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-amber-700">5 / 5 Tasks Completed</span>
        </div>

        {/* CTA Button */}
        <div className={`transition-all duration-500 delay-[900ms] ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}>
          <button
            onClick={handleClose}
            className="w-full py-3.5 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold rounded-xl shadow-lg shadow-brand-200/50 hover:shadow-xl hover:shadow-brand-300/50 active:scale-[0.98] transition-all text-sm"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function GettingStartedChecklist({ stats, gymId }: { stats?: DashboardStats; gymId: string }) {
  const router = useRouter()
  const storageKey = `gymdesk_getting_started_${gymId}`
  const dismissedKey = `gymdesk_getting_started_dismissed_${gymId}`

  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set())
  const [showCelebration, setShowCelebration] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [justCompleted, setJustCompleted] = useState<string | null>(null)
  const [notification, setNotification] = useState<string | null>(null)

  // Backend auto-detection flags
  const autoCompleted = useMemo(() => {
    const set = new Set<string>()
    if (stats) {
      if (stats.total_active > 0 || stats.expired_count > 0) set.add('add_member')
      if (stats.today_attendance > 0) set.add('mark_attendance')
      if (stats.today_collection > 0) set.add('view_payments')
    }
    return set
  }, [stats])

  // Load persisted state and merge with backend auto-detected tasks
  useEffect(() => {
    const loadState = () => {
      try {
        const saved = localStorage.getItem(storageKey)
        let parsed = new Set<string>()
        if (saved) {
          parsed = new Set(JSON.parse(saved))
        }
        // Merge auto-detected tasks from backend
        autoCompleted.forEach(id => parsed.add(id))
        setCompletedTasks(parsed)

        const isDismissed = localStorage.getItem(dismissedKey)
        if (isDismissed === 'true') {
          setDismissed(true)
        }
      } catch {
        // ignore
      }
    }

    loadState()
    setMounted(true)

    // Listen for cross-component storage updates
    window.addEventListener('storage', loadState)
    return () => window.removeEventListener('storage', loadState)
  }, [autoCompleted])

  // removed automatic localStorage sync on every completedTasks change to prevent race conditions

  // Trigger celebration when all tasks are complete
  useEffect(() => {
    if (completedTasks.size === TASKS.length && !dismissed) {
      const hasShown = localStorage.getItem(`gymdesk_celebrated_${gymId}`)
      if (!hasShown) {
        setTimeout(() => setShowCelebration(true), 800)
        localStorage.setItem(`gymdesk_celebrated_${gymId}`, 'true')
      }
    }
  }, [completedTasks.size, dismissed, gymId])

  const toggleTask = useCallback((taskId: string) => {
    // Prevent manual toggle for tasks that are auto-detected from backend
    if (autoCompleted.has(taskId)) return

    setCompletedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
        setJustCompleted(null)
      } else {
        next.add(taskId)
        setJustCompleted(taskId)
        setNotification('Task completed! Keep it up 🚀')
        // Clear the animation flag after it finishes
        setTimeout(() => setJustCompleted(null), 600)
        setTimeout(() => setNotification(null), 3000)
        // Check if all tasks now complete
        if (next.size === TASKS.length) {
          setTimeout(() => setShowCelebration(true), 800)
        }
      }

      // Save directly when toggled to avoid race conditions
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]))
        window.dispatchEvent(new Event('storage'))
      } catch { }

      return next
    })
  }, [autoCompleted, storageKey])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(dismissedKey, 'true')
      window.dispatchEvent(new Event('storage'))
    } catch { /* ignore */ }
  }, [dismissedKey])

  const handleCloseCelebration = useCallback(() => {
    setShowCelebration(false)
    handleDismiss()
  }, [handleDismiss])

  const completedCount = completedTasks.size
  const progressPercent = (completedCount / TASKS.length) * 100

  // Don't render until mounted (prevents hydration mismatch)
  if (!mounted) return null

  // Don't show if dismissed
  if (dismissed) return null

  return (
    <>
      {/* Celebration Modal */}
      {showCelebration && <CelebrationModal onClose={handleCloseCelebration} />}

      {/* Checklist Card */}
      <div className="card overflow-hidden animate-slide-up h-full flex flex-col">
        {/* Header */}
        <div className="px-4 md:px-5 pt-4 md:pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-sm shadow-brand-200">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-bold text-slate-900 text-sm md:text-base">Getting Started</h2>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold text-brand-600">{completedCount}/{TASKS.length}</span>
              <button
                onClick={handleDismiss}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
                title="Dismiss checklist"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progressPercent}%`,
                background: progressPercent === 100
                  ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                  : 'linear-gradient(90deg, var(--brand-500, #6366f1), var(--brand-600, #4f46e5))',
              }}
            />
          </div>
        </div>

        {/* Task List */}
        <div className="divide-y divide-slate-100">
          {TASKS.map((task, index) => {
            const isCompleted = completedTasks.has(task.id) || autoCompleted.has(task.id)
            const isAutoDetected = autoCompleted.has(task.id)
            const isJustCompleted = justCompleted === task.id
            const TaskIcon = task.icon

            return (
              <div
                key={task.id}
                className={`group flex items-center gap-3 px-4 md:px-5 py-3.5 transition-all duration-300 hover:bg-slate-50/80 ${isJustCompleted ? 'bg-emerald-50/50' : ''
                  }`}
                style={{
                  animationDelay: `${index * 80}ms`,
                }}
              >
                {/* Checkbox */}
                <div
                  className={`relative w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isCompleted
                      ? 'bg-emerald-500 border-emerald-500 scale-100'
                      : 'border-slate-300'
                    } ${isJustCompleted ? 'animate-pop-in' : ''}`}
                >
                  {isCompleted && (
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold transition-all duration-300 ${isCompleted
                      ? 'text-slate-400 line-through'
                      : 'text-slate-800'
                    }`}>
                    {task.title}
                  </p>
                  <p className={`text-xs mt-0.5 transition-all duration-300 ${isCompleted ? 'text-slate-300' : 'text-slate-400'
                    }`}>
                    {task.description}
                  </p>
                </div>

                {/* Navigate Link */}
                {!isCompleted && (
                  <Link
                    href={task.href}
                    className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r ${task.color} ${task.colorTo} text-white opacity-0 group-hover:opacity-100 transition-all duration-200 hover:shadow-md active:scale-95 whitespace-nowrap`}
                  >
                    Go
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                )}

                {isCompleted && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-emerald-500">
                    <Check className="w-3.5 h-3.5" />
                    Done
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer hint or notification */}
        <div className="px-4 md:px-5 py-3 bg-slate-50/50 border-t border-slate-100 min-h-[44px] flex items-center justify-center transition-all duration-300">
          {notification ? (
            <p className="text-sm font-semibold text-emerald-600 animate-slide-up flex items-center gap-1.5">
              <Check className="w-4 h-4" /> {notification}
            </p>
          ) : completedCount < TASKS.length ? (
            <p className="text-xs text-slate-400 text-center animate-slide-up">
              ✨ Complete all tasks to unlock your achievement badge!
            </p>
          ) : (
            <p className="text-xs text-slate-400 text-center">
              All tasks completed!
            </p>
          )}
        </div>
      </div>
    </>
  )
}
