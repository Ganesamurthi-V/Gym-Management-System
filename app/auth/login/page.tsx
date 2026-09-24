'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowRight, Check, Building2, UserRound, ShieldCheck } from 'lucide-react'
import { WelcomeTransition } from '@/components/ui/WelcomeTransition'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthAside } from '@/components/auth/AuthAside'
import { AUTH_ASIDE } from '@/components/auth/authAsideContent'
import {
  authDividerLabel,
  authHeading,
  authInput,
  authLabel,
  authLink,
  authPanel,
  authPrimaryButton,
  authSub,
} from '@/components/auth/authStyles'
import { signOutViaApi } from '@/lib/auth/client-auth'
import { clearLoginFailures, getLoginThrottle, recordLoginFailure } from '@/lib/member/lockout'
import { safeMemberRedirect } from '@/lib/member/redirect'
import type { AppRole } from '@/lib/auth/roles'

// ─── Registration Success Banner ────────────────────────────────────────────────

/*
  Semantic colour is kept through the monochrome restyle. The surface, type and primary
  action lost the brand blue, but success, error and warning states did not: colour is
  carrying meaning in them, and each pairs it with an icon and wording so it is never the
  only cue.
*/
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
      /* Opaque neutral track, so the grid never shows through behind the tab labels.
         That is what lets the inactive label sit at neutral-600, below the neutral-700
         floor that applies to text directly on the surface. */
      className="mb-[var(--auth-gap-md)] grid grid-cols-2 gap-1 rounded-2xl border border-neutral-200 bg-neutral-100 p-1"
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
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed ${
              active
                ? 'bg-white text-neutral-950 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
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
  const [memberLoginSuccess, setMemberLoginSuccess] = useState(false)
  const [memberName, setMemberName] = useState('')

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
      void signOutViaApi('local')
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

        // Show welcome screen + prefetch all member data in background
        const nameFromEmail = email
          .split('@')[0]
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
        setMemberName(json.userName || nameFromEmail)
        setMemberLoginSuccess(true)

        // Prefetch member routes + bundle API while animation plays
        router.prefetch(next)
        router.prefetch('/m/home')
        router.prefetch('/m/workout')
        router.prefetch('/m/rewards')
        router.prefetch('/m/membership')

        // Fetch the member bundle API (all member data) + RSC pages
        fetch('/api/member/bundle', { credentials: 'same-origin' }).catch(() => {})
        fetch(next, { headers: { 'RSC': '1', 'Next-Router-Prefetch': '1' }, credentials: 'same-origin' }).catch(() => {})

        setTimeout(() => {
          router.replace(next)
        }, 2500)
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

        // Prefetch the dashboard + key owner routes IMMEDIATELY while the
        // welcome animation plays (~2.8s). By the time the animation finishes,
        // the RSC payload (including all DB data) is already in the router
        // cache, so navigation renders instantly with zero network wait.
        const target = json.redirectTo ?? '/owner/dashboard'
        router.prefetch(target)
        router.prefetch('/owner/members')
        router.prefetch('/owner/payments')
        router.prefetch('/owner/attendance')

        // For dynamic routes, prefetch only fetches the loading shell.
        // Warm the full page by fetching it as RSC (same way router.push does)
        // so all DB queries run during the animation, not after navigation.
        fetch(target, { headers: { 'RSC': '1', 'Next-Router-Prefetch': '1' }, credentials: 'same-origin' }).catch(() => {})
        fetch('/owner/members', { headers: { 'RSC': '1', 'Next-Router-Prefetch': '1' }, credentials: 'same-origin' }).catch(() => {})

        setTimeout(() => {
          router.push(target)
        }, 2800)
      } else {
        router.prefetch(json.redirectTo ?? '/owner/onboarding')
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
  if (memberLoginSuccess) {
    return (
      <WelcomeTransition
        userName={memberName}
        subtitle="Loading your fitness journey..."
      />
    )
  }

  if (loginSuccess) {
    return <WelcomeTransition userName={userName} />
  }

  return (
    <AuthShell
      maxWidth={400}
      /* The left column follows the tab — see authAsideContent for why it has to. */
      aside={<AuthAside {...AUTH_ASIDE[role]} />}
      footer={
        /* Sits on the live grid rather than in the card, and is too small and too far from
           the aside to be worth its own scrim. Original size, darker ink — neutral-800 at
           8.05 rather than neutral-700 at 5.52.

           Hidden under 680px of viewport height, on the same reasoning as the aside's trial
           note: it is reassurance rather than information, and once the fluid spacing has
           closed as far as it can, the only way to fit a short window is to drop the lines
           nobody needs in order to sign in. The encryption is a fact about the transport,
           not an instruction. */
        <p className="text-xs font-medium text-neutral-800 [@media(max-height:680px)]:hidden">
          Secured with end-to-end encryption
        </p>
      }
    >
      <div
        className={`transition-all duration-500 ${
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <RoleSelector value={role} onChange={switchRole} disabled={loading} />

        <div className="mb-[var(--auth-gap-md)]">
          <h1 className={authHeading}>{copy.heading}</h1>
          <p className={authSub}>{copy.sub}</p>
        </div>

        {showRegBanner && <RegistrationSuccessBanner onDismiss={() => setShowRegBanner(false)} />}

        {notice && (
          <div
            role="status"
            className="animate-slide-up mb-5 flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-sm font-semibold text-neutral-900"
          >
            <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
            {notice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="animate-slide-up mb-5 flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3.5 text-sm font-semibold text-red-700"
          >
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              <span className="text-xs text-red-600">!</span>
            </div>
            {error}
          </div>
        )}

        {!error && role === 'member' && attemptsRemaining < 5 && (
          <p role="status" className="mb-4 text-xs font-semibold text-amber-700">
            {attemptsRemaining} sign-in attempts remaining on this device.
          </p>
        )}

        <form
          id="login-form"
          role="tabpanel"
          aria-labelledby={`role-tab-${role}`}
          onSubmit={handleLogin}
          className="space-y-[var(--auth-gap-sm)]"
        >
          <div>
            <label htmlFor="email" className={authLabel}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authInput}
              placeholder={copy.placeholder}
              required
              autoComplete="email"
              aria-invalid={Boolean(error)}
            />
          </div>

          <div>
            <label htmlFor="password" className={authLabel}>
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${authInput} pr-12`}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                aria-invalid={Boolean(error)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || isLocked}
            aria-busy={loading}
            className={`${authPrimaryButton} group`}
          >
            {isLocked ? (
              `Try again in ${lockoutLabel}`
            ) : loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <div className="my-[var(--auth-gap-md)] flex items-center gap-4">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className={authDividerLabel}>Or</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        {role === 'owner' ? (
          <p className="text-center text-sm text-neutral-700">
            Don&apos;t have an account?{' '}
            <a href="/auth/create-account" className={authLink}>
              Create account
            </a>
          </p>
        ) : (
          <div className={`flex items-start gap-3 ${authPanel}`}>
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" />
            <p className="text-xs leading-relaxed text-neutral-700">
              Member accounts are created by your gym. Contact them if you have not received
              your secure activation link.
            </p>
          </div>
        )}
      </div>
    </AuthShell>
  )
}

