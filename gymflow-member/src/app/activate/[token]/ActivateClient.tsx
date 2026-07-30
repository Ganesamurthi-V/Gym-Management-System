'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, MailCheck, ShieldCheck, User, Phone, Building2 } from 'lucide-react'

interface MemberInfo {
  memberName: string
  phone: string
  gymName: string
  gymId: string
  currentEmail: string | null
}

type Status = 'loading' | 'ready' | 'submitting' | 'email_sent' | 'success' | 'error' | 'invalid'

export default function ActivateClient({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('loading')
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  // Load member info from the token
  useEffect(() => {
    async function loadInfo() {
      try {
        const res = await fetch(`/api/activate/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const json = await res.json()

        if (!res.ok || !json.success) {
          setStatus('invalid')
          setError(json.error ?? 'This activation link is invalid or has expired.')
          return
        }

        setMemberInfo(json.data)
        if (json.data.currentEmail) setEmail(json.data.currentEmail)
        setStatus('ready')
      } catch {
        setStatus('invalid')
        setError('Unable to verify this link. Please check your connection and try again.')
      }
    }
    void loadInfo()
  }, [token])

  async function handleActivate(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    // Validation
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!/\d/.test(password)) {
      setError('Password must contain at least one number.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setStatus('submitting')

    try {
      const res = await fetch('/api/activate/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: trimmedEmail, password }),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        setError(json.error ?? 'Activation failed. Please try again.')
        setStatus('ready')
        return
      }

      // Email verification sent — show intermediate state
      setStatus('email_sent')
    } catch {
      setError('Something went wrong. Please check your connection and try again.')
      setStatus('ready')
    }
  }

  // Loading state
  if (status === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-slate-500">Verifying your activation link...</p>
        </div>
      </main>
    )
  }

  // Invalid/expired token
  if (status === 'invalid') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <ShieldCheck className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-red-900">Invalid Activation Link</h1>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <p className="mt-4 text-xs text-red-600">Contact your gym to request a new invitation.</p>
        </div>
      </main>
    )
  }

  // Success state — account fully activated (redirected here after email verification)
  if (status === 'success') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-lg font-bold text-emerald-900">Account Activated!</h1>
          <p className="mt-2 text-sm text-emerald-700">
            Your member portal account has been successfully activated.
          </p>
          <p className="mt-1 text-sm text-emerald-600">
            You can now sign in with your email and password.
          </p>
          <a
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Go to Login
          </a>
        </div>
      </main>
    )
  }

  // Email sent — waiting for verification (REALTIME POLLING)
  if (status === 'email_sent') {
    return <EmailSentScreen email={email} token={token} onActivated={() => setStatus('success')} />
  }

  // Ready state — show form
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Background */}
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-gradient-to-br from-brand-400/20 to-violet-500/10 blur-[90px]" />
        <div className="absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-cyan-400/15 to-emerald-400/10 blur-[80px]" />
      </div>

      <section className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/icons/icon.svg" alt="GymFlow" width={56} height={56} priority className="mb-3 rounded-2xl shadow-lg" />
          <h1 className="text-2xl font-bold text-slate-900">Activate Your Account</h1>
          <p className="mt-1 text-sm text-slate-500">Set up your login credentials to get started.</p>
        </div>

        {/* Member Info Card */}
        {memberInfo && (
          <div className="mb-5 rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-600">Your Details</p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <User className="h-4 w-4 text-brand-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-800">{memberInfo.memberName}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-brand-500 flex-shrink-0" />
                <span className="text-sm text-slate-600">{memberInfo.phone}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-brand-500 flex-shrink-0" />
                <span className="text-sm text-slate-600">{memberInfo.gymName}</span>
              </div>
            </div>
          </div>
        )}

        {/* Activation Form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleActivate} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                  placeholder="your@email.com"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">This will be your login email. A verification mail will be sent.</p>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                Create Password
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-slate-700">
                Confirm Password
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                  placeholder="Re-enter your password"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'submitting' || !email || password.length < 8 || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'submitting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Activating...
                </>
              ) : (
                'Press to Activate'
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

/**
 * "Check Your Email" screen with realtime polling.
 * Polls /api/activate/status every 3 seconds. When the callback route
 * completes activation (user clicked the magic link), this auto-transitions
 * to the success state without any manual refresh.
 */
function EmailSentScreen({
  email,
  token,
  onActivated,
}: {
  email: string
  token: string
  onActivated: () => void
}) {
  const [polling, setPolling] = useState(true)

  useEffect(() => {
    if (!polling) return

    let cancelled = false
    const POLL_INTERVAL = 3000

    async function check() {
      try {
        const res = await fetch('/api/activate/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const json = await res.json()
        if (!cancelled && json.activated) {
          setPolling(false)
          onActivated()
        }
      } catch {
        // Network error — keep polling
      }
    }

    // Initial check
    void check()

    const interval = setInterval(check, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token, polling, onActivated])

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} priority className="mb-4 rounded-2xl shadow-md" />
        </div>

        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
            <MailCheck className="h-8 w-8 text-brand-600" />
          </div>

          <h1 className="text-xl font-bold text-brand-900">Check Your Email</h1>

          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            We&apos;ve sent a verification email to:
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">{email}</p>

          <div className="mt-5 rounded-xl border border-brand-100 bg-white p-4 text-left">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600 mb-2">Next Steps</p>
            <ol className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 flex-shrink-0">1</span>
                Open the email from GymFlow
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 flex-shrink-0">2</span>
                Click the &quot;Activate Account&quot; button
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 flex-shrink-0">3</span>
                This page will update automatically
              </li>
            </ol>
          </div>

          {/* Realtime indicator */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
            </span>
            <span className="text-xs font-medium text-brand-600">Waiting for confirmation...</span>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Didn&apos;t receive the email? Check your spam folder or contact your gym.
          </p>
        </div>
      </div>
    </main>
  )
}
