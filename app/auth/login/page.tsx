'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Dumbbell, ArrowRight, Users, TrendingUp, Shield, Zap } from 'lucide-react'

// ─── Animated Grid Background ───────────────────────────────────────────────────

function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-brand-400/20 to-violet-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-cyan-400/15 to-emerald-400/10 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
      <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] bg-gradient-to-r from-brand-500/10 to-purple-500/10 rounded-full blur-[60px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '4s' }} />

      {/* Grid overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Floating particles */}
      {Array.from({ length: 20 }).map((_, i) => {
        const r1 = Math.abs((Math.sin(i + 1) * 10000) % 1)
        const r2 = Math.abs((Math.sin(i + 2) * 10000) % 1)
        const r3 = Math.abs((Math.sin(i + 3) * 10000) % 1)
        const r4 = Math.abs((Math.sin(i + 4) * 10000) % 1)
        return (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            style={{
              left: `${(r1 * 100).toFixed(2)}%`,
              top: `${(r2 * 100).toFixed(2)}%`,
              animation: `float-particle ${(6 + r3 * 8).toFixed(2)}s ease-in-out infinite`,
              animationDelay: `${(r4 * 5).toFixed(2)}s`,
            }}
          />
        )
      })}
    </div>
  )
}

// ─── Feature Card ───────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode; title: string; description: string; delay: number }) {
  return (
    <div
      className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] transition-all duration-500 group"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400/20 to-brand-500/10 border border-brand-400/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-white/90 mb-0.5">{title}</h3>
        <p className="text-xs text-white/40 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ─── Stats Pill ─────────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-3 rounded-xl bg-white/[0.05] border border-white/[0.06]">
      <span className="text-lg font-black text-white tracking-tight">{value}</span>
      <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">{label}</span>
    </div>
  )
}

// ─── Welcome Transition Screen ──────────────────────────────────────────────────

function WelcomeTransition({ userName }: { userName: string }) {
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
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
            Welcome back{userName ? ',' : '!'}<br />
            {userName && <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-cyan-400 bg-clip-text text-transparent">{userName}</span>}
          </h1>
          <p className="text-white/40 text-sm font-medium">
            You&apos;re all set! Taking you to your dashboard...
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

// ─── Main Login Page ────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])
  const [loginSuccess, setLoginSuccess] = useState(false)
  const [userName, setUserName] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error, data } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    // Extract name from email for welcome message
    const nameFromEmail = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    setUserName(data.user?.user_metadata?.name || nameFromEmail)
    setLoginSuccess(true)

    // Redirect after the welcome animation
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 2800)
  }

  // ─── Welcome Animation Overlay ───
  if (loginSuccess) {
    return <WelcomeTransition userName={userName} />
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── LEFT PANEL: Dark branded hero ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-[#0B0F1A] flex-col justify-between p-10 xl:p-14 overflow-hidden">
        <GridBackground />

        {/* Top: Logo */}
        <div className={`relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-400 to-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Dumbbell className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-black text-white tracking-tight">GymDesk</span>
          </div>
        </div>

        {/* Center: Hero content */}
        <div className={`relative z-10 space-y-8 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-400/20">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              <span className="text-[11px] font-bold text-brand-300 uppercase tracking-wider">Gym Management Platform</span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight">
              Welcome to<br />
              <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-cyan-400 bg-clip-text text-transparent">
                GymDesk
              </span>
            </h1>
            <p className="text-base text-white/40 max-w-md leading-relaxed font-medium">
              The complete gym management platform trusted by gym owners across Tamil Nadu and Pondicherry.
            </p>
          </div>

          {/* Feature cards */}
          <div className="space-y-3 max-w-md">
            <FeatureCard
              icon={<Users className="w-4.5 h-4.5 text-brand-300" />}
              title="Member Management"
              description="Track memberships, attendance, and renewals effortlessly"
              delay={400}
            />
            <FeatureCard
              icon={<TrendingUp className="w-4.5 h-4.5 text-emerald-300" />}
              title="Revenue Analytics"
              description="Real-time collection reports and growth tracking"
              delay={600}
            />
            <FeatureCard
              icon={<Zap className="w-4.5 h-4.5 text-amber-300" />}
              title="WhatsApp Reminders"
              description="Automated renewal and due reminders via WhatsApp"
              delay={800}
            />
          </div>
        </div>

        {/* Bottom: Value props for new users */}
        <div className={`relative z-10 space-y-4 transition-all duration-700 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex flex-wrap gap-2.5">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-500/10 border border-emerald-400/15">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-300 tracking-wide">Free Forever</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-brand-500/10 border border-brand-400/15">
              <Zap className="w-3 h-3 text-brand-300" />
              <span className="text-[11px] font-bold text-brand-300 tracking-wide">Setup in 2 Minutes</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-500/10 border border-amber-400/15">
              <Shield className="w-3 h-3 text-amber-300" />
              <span className="text-[11px] font-bold text-amber-300 tracking-wide">No Credit Card Needed</span>
            </div>
          </div>
          <p className="text-[11px] text-white/20 font-medium">
            © {new Date().getFullYear()} GymDesk. Built for gym owners, by fitness enthusiasts.
          </p>
        </div>
      </div>

      {/* ─── RIGHT PANEL: Login form ─── */}
      <div className="flex-1 flex flex-col bg-[#FAFBFD] lg:bg-white">
        {/* Mobile logo (only on smaller screens) */}
        <div className="lg:hidden flex items-center gap-3 p-6 pb-0">
          <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center">
            <Dumbbell className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-lg font-black text-slate-900 tracking-tight">GymDesk</span>
        </div>

        {/* Form container — centered */}
        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className={`w-full max-w-[400px] transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            {/* Heading */}
            <div className="mb-8">
              <h2 className="text-2xl font-black text-[#0F172A] tracking-tight">Sign in</h2>
              <p className="text-sm text-slate-400 mt-1.5 font-medium">
                Access your gym management dashboard
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-semibold animate-slide-up">
                <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-red-500 text-xs">!</span>
                </div>
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all duration-200"
                  placeholder="owner@mygym.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 px-4 pr-12 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all duration-200"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/20 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-7">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Contact admin */}
            <div className="text-center space-y-4">
              <p className="text-sm text-slate-400 font-medium">
                Don&apos;t have an account?{' '}
                <a href="mailto:support@gymdesk.in" className="text-brand-600 font-bold hover:text-brand-700 transition-colors">
                  Contact Admin
                </a>
              </p>
            </div>

            {/* Bottom security badge */}
            <div className="mt-10 flex items-center justify-center gap-2 text-[11px] text-slate-300 font-medium">
              <Shield className="w-3.5 h-3.5" />
              <span>Secured with end-to-end encryption</span>
            </div>
          </div>
        </div>
      </div>

      {/* CSS for floating particles */}
      <style>{`
        @keyframes float-particle {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.5; }
          50% { transform: translateY(-10px) translateX(-5px); opacity: 0.3; }
          75% { transform: translateY(-30px) translateX(15px); opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
