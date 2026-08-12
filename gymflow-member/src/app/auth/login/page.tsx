'use client'

import Image from 'next/image'
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clearLoginFailures, getLoginThrottle, recordLoginFailure } from '@/lib/auth/lockout'
import { safeMemberRedirect } from '@/lib/auth/redirect'

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutesPart = Math.floor(seconds / 60)
  const secondsPart = String(seconds % 60).padStart(2, '0')
  return `${minutesPart}:${secondsPart}`
}

function authMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('email not confirmed')) {
    return 'Please verify your email before signing in. Contact your gym if you need a new link.'
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Too many requests. Please wait before trying again.'
  }
  return 'Email or password is incorrect.'
}

export default function LoginPage() {
  const router = useRouter()
  const submittingRef = useRef(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [remainingMs, setRemainingMs] = useState(0)
  const [attemptsRemaining, setAttemptsRemaining] = useState(5)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'not_member') {
      setError('This account is not linked to a GymFlow member profile. Contact your gym.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const syncThrottle = async () => {
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
    void syncThrottle()
    return () => { cancelled = true }
  }, [email])

  useEffect(() => {
    if (remainingMs <= 0) return
    const timer = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [remainingMs])

  const isLocked = remainingMs > 0
  const lockoutLabel = useMemo(() => formatRemaining(remainingMs), [remainingMs])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return

    submittingRef.current = true
    setLoading(true)
    setError('')

    try {
      const throttle = await getLoginThrottle(email)
      if (throttle.isLocked) {
        setRemainingMs(throttle.remainingMs)
        setError(`Too many failed attempts. Try again in ${formatRemaining(throttle.remainingMs)}.`)
        return
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        const state = await recordLoginFailure(email)
        setRemainingMs(state.remainingMs)
        setAttemptsRemaining(state.attemptsRemaining)
        setError(
          state.isLocked
            ? 'Too many failed attempts. Sign-in is paused for 15 minutes on this device.'
            : `${authMessage(json.error ?? '')} ${state.attemptsRemaining} attempt${state.attemptsRemaining === 1 ? '' : 's'} remaining.`,
        )
        return
      }

      await clearLoginFailures(email)
      const nextPath = safeMemberRedirect(new URLSearchParams(window.location.search).get('next'))
      router.replace(nextPath)
      router.refresh()
    } catch {
      setError(navigator.onLine ? 'Unable to sign in right now. Please try again.' : 'You are offline. Reconnect to sign in.')
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 pt-safe-top pb-safe-bottom">
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-gradient-to-br from-brand-400/20 to-violet-500/10 blur-[90px] [animation:float-orb_8s_ease-in-out_infinite]" />
        <div className="absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-cyan-400/15 to-emerald-400/10 blur-[80px] [animation:float-orb_6s_ease-in-out_infinite]" />
        <svg className="h-full w-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="auth-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M60 0H0V60" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#auth-grid)" />
        </svg>
      </div>

      <section className="relative z-10 w-full max-w-md animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/icons/icon.svg" alt="GymFlow" width={64} height={64} priority className="mb-4 rounded-2xl shadow-lg shadow-brand-950/40" />
          <h1 className="bg-gradient-to-r from-brand-300 via-brand-400 to-cyan-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Welcome to GymFlow
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">Sign in to view your membership, workouts, and progress.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl shadow-black/25 backdrop-blur-xl xs:p-6">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-200">Email address</label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input-field border-white/10 bg-slate-950/70 pl-11 text-slate-50 placeholder:text-slate-500"
                  placeholder="member@example.com"
                  aria-invalid={Boolean(error)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-200">Password</label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input-field border-white/10 bg-slate-950/70 pl-11 pr-12 text-slate-50 placeholder:text-slate-500"
                  placeholder="Enter your password"
                  aria-invalid={Boolean(error)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="tap-target absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error ? (
              <div role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-200">
                {error}
              </div>
            ) : attemptsRemaining < 5 ? (
              <p role="status" className="text-xs text-amber-300">{attemptsRemaining} sign-in attempts remaining on this device.</p>
            ) : null}

            <button type="submit" className="btn-primary" disabled={loading || isLocked || !email || password.length < 8} aria-busy={loading}>
              {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" /> : null}
              {isLocked ? `Try again in ${lockoutLabel}` : loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-brand-400/15 bg-brand-500/10 p-3.5">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
            <p className="text-xs leading-relaxed text-slate-300">Accounts are created by your gym. Contact them if you have not received your secure password setup link.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
