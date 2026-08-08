'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Eye,
  EyeOff,
  ArrowRight,
  Users,
  TrendingUp,
  Shield,
  Zap,
  Check,
  Building2,
  UserRound,
  ShieldCheck,
} from 'lucide-react'
import { WelcomeTransition } from '@/components/ui/WelcomeTransition'
import { createClient } from '@/lib/supabase/client'
import { clearLoginFailures, getLoginThrottle, recordLoginFailure } from '@/lib/member/lockout'
import { safeMemberRedirect } from '@/lib/member/redirect'
import type { AppRole } from '@/lib/auth/roles'

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

// ─── Registration Success Banner ────────────────────────────────────────────────

function RegistrationSuccessBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-800">Account created successfully.</p>
          <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
            Your email has been verified. Please sign in using your email and password.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-emerald-400 hover:text-emerald-600 transition-colors flex-shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Role Selector ──────────────────────────────────────────────────────────────

const ROLE_COPY: Record<AppRole, { tab: string; heading: string; sub: string; placeholder: string }> = {
  owner: {
    tab: 'Gym Owner',
    heading: 'Sign in',
    sub: 'Access your gym management dashboard',
    placeholder: 'owner@mygym.com',
  },
  member: {
    tab: 'Member',
    heading: 'Member sign in',
    sub: 'View your membership, workouts, and progress',
    placeholder: 'member@example.com',
  },
}

function RoleSelector({
  value,
  onChange,
  disabled,
}: {
  value: AppRole
  onChange: (role: AppRole) => void
  disabled: boolean
}) {
  return (
    <div
      role="tablist"
      aria-label="Choose account type"
      className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1"
    >
      {(['owner', 'member'] as const).map((role) => {
        const active = value === role
        const Icon = role === 'owner' ? Building2 : UserRound
        return (
          <button
            key={role}
            type="button"
            role="tab"
            id={`role-tab-${role}`}
            aria-selected={active}
            aria-controls="login-form"
            disabled={disabled}
            onClick={() => onChange(role)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition-all duration-200 disabled:cursor-not-allowed ${
              active
                ? 'bg-white text-[#0F172A] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
            {ROLE_COPY[role].tab}
          </button>
        )
      })}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutesPart = Math.floor(seconds / 60)
  const secondsPart = String(seconds % 60).padStart(2, '0')
  return `${minutesPart}:${secondsPart}`
}

// ─── Main Login Page ────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const submittingRef = useRef(false)

  const [role, setRole] = useState<AppRole>('owner')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mounted, setMounted] = useState(false)
  const [showRegBanner, setShowRegBanner] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)
  const [userName, setUserName] = useState('')

  // Member-only client-side lockout (carried over from the standalone PWA).
  // The server enforces the real IP + email rate limits; this is extra friction.
  const [remainingMs, setRemainingMs] = useState(0)
  const [attemptsRemaining, setAttemptsRemaining] = useState(5)

  // ── Read the query string once on mount ─────────────────────────────────────
  useEffect(() => {
    setMounted(true)
    const params = new URLSearchParams(window.location.search)

    const roleParam = params.get('role')
    if (roleParam === 'member' || roleParam === 'owner') setRole(roleParam)

    const errorParam = params.get('error')
    if (errorParam === 'blocked') {
      setError('Your access is blocked by admin')
    } else if (errorParam === 'not_member') {
      setRole('member')
      setError('This account is not linked to a GymFlow member profile. Contact your gym.')
      /**
       * The middleware deliberately lets `error=not_member` render even with a
       * live session, to break the /m/home <-> /auth/login redirect loop. That
       * means a dead session is still in the cookie jar — clear it here so the
       * next attempt starts clean.
       */
      try {
        void createClient().auth.signOut({ scope: 'local' })
      } catch {
        /* Supabase env missing — nothing to clear. */
      }
    }

    if (params.get('registered') === '1') {
      setShowRegBanner(true)
      const emailParam = params.get('email')
      if (emailParam) setEmail(decodeURIComponent(emailParam))
      const t = setTimeout(() => setShowRegBanner(false), 6000)
      return () => clearTimeout(t)
    }
  }, [])

  // ── Sync the member lockout state as the email is typed ─────────────────────
  useEffect(() => {
    if (role !== 'member') {
      setRemainingMs(0)
      setAttemptsRemaining(5)
      return
    }
    let cancelled = false
    const sync = async () => {
      if (!email.trim()) {
        setRemainingMs(0)
        setAttemptsRemaining(5)
        return
      }
      const state = await getLoginThrottle(email)
      if (!cancelled) {
        setRemainingMs(state.remainingMs)
        setAttemptsRemaining(state.attemptsRemaining)
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [email, role])

  useEffect(() => {
    if (remainingMs <= 0) return
    const timer = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [remainingMs])

  const isLocked = role === 'member' && remainingMs > 0
  const lockoutLabel = useMemo(() => formatRemaining(remainingMs), [remainingMs])
  const copy = ROLE_COPY[role]

  function switchRole(next: AppRole) {
    setRole(next)
    setError('')
    setNotice('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return

    submittingRef.current = true
    setLoading(true)
    setError('')
    setNotice('')

    try {
      // Member tab: honour the device lockout before spending a server attempt.
      if (role === 'member') {
        const throttle = await getLoginThrottle(email)
        if (throttle.isLocked) {
          setRemainingMs(throttle.remainingMs)
          setError(`Too many failed attempts. Try again in ${formatRemaining(throttle.remainingMs)}.`)
          return
        }
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'same-origin',
      })

      const json: {
        success?: boolean
        role?: AppRole
        redirectTo?: string
        onboardingCompleted?: boolean
        userName?: string | null
        error?: string
        code?: string
      } = await res.json()

      if (!res.ok || !json.success) {
        if (role === 'member') {
          const state = await recordLoginFailure(email)
          setRemainingMs(state.remainingMs)
          setAttemptsRemaining(state.attemptsRemaining)
          setError(
            state.isLocked
              ? 'Too many failed attempts. Sign-in is paused for 15 minutes on this device.'
              : `${json.error ?? 'Email or password is incorrect.'}${
                  res.status === 401
                    ? ` ${state.attemptsRemaining} attempt${state.attemptsRemaining === 1 ? '' : 's'} remaining.`
                    : ''
                }`,
          )
        } else {
          setError(json.error ?? 'Invalid email or password')
        }
        setLoading(false)
        return
      }

      await clearLoginFailures(email)

      const resolvedRole = json.role ?? 'owner'

      // ── Wrong tab ─────────────────────────────────────────────────────────
      // The credentials were valid, just entered under the other account type.
      // Say so plainly, then send them to the right place rather than making
      // them type everything again.
      if (resolvedRole !== role) {
        setNotice(
          resolvedRole === 'member'
            ? 'That is a member account. Taking you to the member app…'
            : 'That is a gym owner account. Taking you to your dashboard…',
        )
        setTimeout(() => {
          router.replace(json.redirectTo ?? (resolvedRole === 'member' ? '/m/home' : '/owner/dashboard'))
          router.refresh()
        }, 1400)
        return
      }

      // ── Member ────────────────────────────────────────────────────────────
      if (resolvedRole === 'member') {
        const next = safeMemberRedirect(new URLSearchParams(window.location.search).get('next'))
        router.replace(next)
        router.refresh()
        return
      }

      // ── Owner ─────────────────────────────────────────────────────────────
      if (json.onboardingCompleted) {
        const nameFromEmail = email
          .split('@')[0]
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
        setUserName(json.userName || nameFromEmail)
        setLoginSuccess(true)

        setTimeout(() => {
          router.push(json.redirectTo ?? '/owner/dashboard')
          router.refresh()
        }, 2800)
      } else {
        router.push(json.redirectTo ?? '/owner/onboarding')
        router.refresh()
      }
    } catch {
      setError('Network error. Please check your connection.')
      setLoading(false)
    } finally {
      submittingRef.current = false
      if (role === 'member') setLoading(false)
    }
  }

  // ─── Welcome Animation Overlay ───
  if (loginSuccess) {
    return <WelcomeTransition userName={userName} />
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── LEFT PANEL: Dark branded hero ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-[#0B0F1A] flex-col p-10 xl:p-14 overflow-hidden">
        <GridBackground />

        {/* Top: Logo */}
        <div className={`relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <Image src="/logo_only.png" alt="GymFlow Logo" width={40} height={40} className="object-contain drop-shadow-md" />
            </div>
            <span className="text-lg font-black text-white tracking-tight">gymflow</span>
          </div>
        </div>

        {/* Center: Hero content */}
        <div className={`relative z-10 mt-16 xl:mt-24 space-y-8 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-400/20">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              <span className="text-[11px] font-bold text-brand-300 uppercase tracking-wider">
                {role === 'member' ? 'Member App' : 'Gym Management Platform'}
              </span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight">
              Welcome to<br />
              <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-cyan-400 bg-clip-text text-transparent">
                gymflow
              </span>
            </h1>
            <p className="text-base text-white/40 max-w-md leading-relaxed font-medium">
              {role === 'member'
                ? 'Your membership, workouts, streaks and rewards — all in one place.'
                : 'The complete gym management platform trusted by gym owners across Tamil Nadu and Pondicherry.'}
            </p>
          </div>

          {/* Feature cards */}
          <div className="space-y-3 max-w-md">
            {role === 'member' ? (
              <>
                <FeatureCard
                  icon={<Users className="w-4.5 h-4.5 text-brand-300" />}
                  title="Digital Membership Card"
                  description="Check in fast and see your plan status at a glance"
                  delay={400}
                />
                <FeatureCard
                  icon={<TrendingUp className="w-4.5 h-4.5 text-emerald-300" />}
                  title="Workouts & Progress"
                  description="Follow assigned programs and track every session"
                  delay={600}
                />
                <FeatureCard
                  icon={<Shield className="w-4.5 h-4.5 text-amber-300" />}
                  title="Streaks & Rewards"
                  description="Earn XP and unlock achievements as you train"
                  delay={800}
                />
              </>
            ) : (
              <>
                <FeatureCard
                  icon={<Users className="w-4.5 h-4.5 text-brand-300" />}
                  title="Member Management"
                  description="Track memberships, attendance, and renewals effortlessly"
                  delay={400}
                />
                <FeatureCard
                  icon={<TrendingUp className="w-4.5 h-4.5 text-emerald-300" />}
                  title="Smart Dashboard"
                  description="Get insights into your gym's performance at a glance"
                  delay={600}
                />
                <FeatureCard
                  icon={<Shield className="w-4.5 h-4.5 text-amber-300" />}
                  title="Fast & Secure"
                  description="Your data is completely secure and accessible anywhere"
                  delay={800}
                />
              </>
            )}
          </div>
        </div>

        {/* Bottom: Value props for new users */}
        <div className={`relative z-10 mt-auto space-y-4 transition-all duration-700 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex flex-wrap gap-2.5">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-500/10 border border-emerald-400/15">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-300 tracking-wide">Free Forever</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-brand-500/10 border border-brand-400/15">
              <Zap className="w-3 h-3 text-brand-300" />
              <span className="text-[11px] font-bold text-brand-300 tracking-wide">Setup in 2 Minutes</span>
            </div>
          </div>
          <p className="text-[11px] text-white/20 font-medium">
            © {new Date().getFullYear()} gymflow. Built for gym owners, by fitness enthusiasts.
          </p>
        </div>
      </div>

      {/* ─── RIGHT PANEL: Login form ─── */}
      <div className="flex-1 flex flex-col bg-[#FAFBFD] lg:bg-white min-w-0">
        {/* Mobile logo (only on smaller screens) */}
        <div className="lg:hidden flex items-center gap-3 p-4 xs:p-6 pb-0 pt-safe-top">
          <div className="w-8 h-8 xs:w-9 xs:h-9 flex items-center justify-center">
            <Image src="/logo_only.png" alt="GymFlow Logo" width={36} height={36} className="object-contain drop-shadow-sm" />
          </div>
          <span className="text-base xs:text-lg font-black text-slate-900 tracking-tight">gymflow</span>
        </div>

        {/* Form container — centered */}
        <div className="flex-1 flex items-center justify-center px-4 xs:px-6 py-8 xs:py-10">
          <div className={`w-full max-w-[400px] transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            {/* Role selector */}
            <RoleSelector value={role} onChange={switchRole} disabled={loading} />

            {/* Heading */}
            <div className="mb-6 xs:mb-8">
              <h2 className="text-xl xs:text-2xl font-black text-[#0F172A] tracking-tight">{copy.heading}</h2>
              <p className="text-sm text-slate-400 mt-1.5 font-medium">{copy.sub}</p>
            </div>

            {/* Registration success banner */}
            {showRegBanner && (
              <RegistrationSuccessBanner onDismiss={() => setShowRegBanner(false)} />
            )}

            {/* Wrong-tab notice */}
            {notice && (
              <div role="status" className="mb-5 flex items-center gap-2.5 p-3.5 bg-brand-50 border border-brand-100 rounded-xl text-brand-700 text-sm font-semibold animate-slide-up">
                <div className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin flex-shrink-0" />
                {notice}
              </div>
            )}

            {/* Error */}
            {error && (
              <div role="alert" className="mb-5 flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-semibold animate-slide-up">
                <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-red-500 text-xs">!</span>
                </div>
                {error}
              </div>
            )}

            {/* Attempts hint (member tab only) */}
            {!error && role === 'member' && attemptsRemaining < 5 && (
              <p role="status" className="mb-4 text-xs font-semibold text-amber-600">
                {attemptsRemaining} sign-in attempts remaining on this device.
              </p>
            )}

            {/* Form */}
            <form id="login-form" role="tabpanel" aria-labelledby={`role-tab-${role}`} onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 bg-white border-2 border-slate-200 rounded-xl text-base sm:text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all duration-200"
                  placeholder={copy.placeholder}
                  required
                  autoComplete="email"
                  aria-invalid={Boolean(error)}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 px-4 pr-12 bg-white border-2 border-slate-200 rounded-xl text-base sm:text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all duration-200"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    aria-invalid={Boolean(error)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading || isLocked}
                aria-busy={loading}
                className="w-full h-12 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/20 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                {isLocked ? (
                  `Try again in ${lockoutLabel}`
                ) : loading ? (
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

            {/* Role-specific footer */}
            {role === 'owner' ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-slate-400 font-medium">
                  Don&apos;t have an account?{' '}
                  <a href="/auth/create-account" className="text-brand-600 font-bold hover:text-brand-700 transition-colors">
                    Create account
                  </a>
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3.5">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                <p className="text-xs leading-relaxed text-slate-600">
                  Member accounts are created by your gym. Contact them if you have not received your
                  secure activation link.
                </p>
              </div>
            )}

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
