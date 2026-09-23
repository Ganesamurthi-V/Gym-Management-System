'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { fetchSession, signOutViaApi, updatePasswordViaApi } from '@/lib/auth/client-auth'
import {
  Eye, EyeOff, Shield, Check, AlertCircle, ArrowRight, Lock, ArrowLeft, Mail,
} from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import {
  authHeading,
  authInput,
  authLabel,
  authLink,
  authPrimaryButton,
  authSub,
} from '@/components/auth/authStyles'

// ─── Password Criteria ────────────────────────────────────────────────────────

interface Criterion {
  label: string
  test: (pw: string) => boolean
}

const PASSWORD_CRITERIA: Criterion[] = [
  { label: 'At least 8 characters',        test: pw => pw.length >= 8 },
  { label: 'At most 128 characters',        test: pw => pw.length <= 128 && pw.length > 0 },
  { label: 'One uppercase letter (A–Z)',    test: pw => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter (a–z)',    test: pw => /[a-z]/.test(pw) },
  { label: 'One digit (0–9)',               test: pw => /\d/.test(pw) },
  { label: 'One special character (!@#…)',  test: pw => /[^A-Za-z0-9]/.test(pw) },
]

// ─── Password Strength Components ────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  return (
    <div className="mt-3 space-y-1.5">
      {PASSWORD_CRITERIA.map(c => {
        const ok = c.test(password)
        return (
          <div
            key={c.label}
            /* Met criteria keep emerald, because that is the state being reported. The
               unmet ones move from slate-400 to neutral-700: at 12px they answer to
               4.5:1, and slate-400 does not reach it over the grid. */
            className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 ${ok ? 'text-emerald-700' : 'text-neutral-700'}`}
          >
            <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-600'}`}>
              <Check className={`w-2.5 h-2.5 transition-opacity duration-200 ${ok ? 'opacity-100' : 'opacity-30'}`} strokeWidth={3} />
            </div>
            {c.label}
          </div>
        )
      })}
    </div>
  )
}

function StrengthBar({ password }: { password: string }) {
  if (!password) return null
  const score = PASSWORD_CRITERIA.filter(c => c.test(password)).length
  const pct   = Math.round((score / PASSWORD_CRITERIA.length) * 100)

  let color = 'bg-red-400'
  let label = 'Weak'
  if (score >= 4) { color = 'bg-amber-400';   label = 'Fair' }
  if (score >= 5) { color = 'bg-emerald-400';  label = 'Strong' }
  if (score === 6) { color = 'bg-emerald-500'; label = 'Very strong' }

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[11px] font-bold ${color.replace('bg-', 'text-')}`}>{label}</p>
    </div>
  )
}

// ─── Token Error Screen ───────────────────────────────────────────────────────

function TokenErrorScreen({ message }: { message: string }) {
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendResult, setResendResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    try {
      setEmail(sessionStorage.getItem('gymflow_signup_email') ?? '')
    } catch {
      // Storage can be unavailable in privacy-focused browsers. The owner can
      // still enter the address manually, which also supports another device.
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleResend() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setResendResult({ ok: false, message: 'Enter the email address you used to create your account.' })
      return
    }

    setResending(true)
    setResendResult(null)

    try {
      const res = await fetch('/api/auth/resend', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ email: normalizedEmail, type: 'signup' }),
      })

      if (res.ok) {
        try { sessionStorage.setItem('gymflow_signup_email', normalizedEmail) } catch { /* optional */ }
        setResendResult({ ok: true, message: 'If this address matches your account, a new verification email is on its way.' })
        setCooldown(60)
      } else if (res.status === 429) {
        setResendResult({ ok: false, message: 'Please wait a few minutes before requesting another email.' })
        setCooldown(60)
      } else {
        setResendResult({ ok: false, message: 'We could not send a new email right now. Please try again.' })
      }
    } catch {
      setResendResult({ ok: false, message: 'Check your internet connection and try again.' })
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex flex-col items-center text-center gap-5 py-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-amber-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-neutral-950">
          We couldn&apos;t verify this link
        </h2>
        {/* neutral-700, not the slate-500 this was: measured over the grid behind it
            slate-500 came to 2.53:1 against a 4.5 floor. */}
        <p className="max-w-xs text-sm leading-relaxed text-neutral-700">
          {message || 'This link has expired or was already used. Request a new link below.'}
        </p>
      </div>

      <div className="w-full max-w-xs space-y-2 text-left">
        <label htmlFor="resend-email" className={authLabel}>
          Account email
        </label>
        <input
          id="resend-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className={`${authInput} h-11`}
        />
      </div>

      {resendResult && (
        <div className={`w-full max-w-xs rounded-xl px-4 py-2.5 text-sm font-medium ${
          resendResult.ok
            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border border-red-100 bg-red-50 text-red-700'
        }`}>
          {resendResult.message}
        </div>
      )}

      <button
        type="button"
        onClick={handleResend}
        disabled={resending || cooldown > 0}
        className={`${authPrimaryButton} h-11 w-auto px-6`}
      >
        {resending ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sending…
          </>
        ) : cooldown > 0 ? (
          `Resend in ${cooldown}s`
        ) : (
          <>
            <ArrowRight className="w-4 h-4" />
            Send a new verification email
          </>
        )}
      </button>

      <div className="flex flex-col items-center gap-3 pt-2">
        <a
          href="/auth/create-account"
          className="flex items-center gap-2 rounded text-sm font-semibold text-neutral-700 transition-colors hover:text-neutral-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Start over with a new account
        </a>
        <a href="/auth/login" className={`${authLink} text-sm`}>
          Already have an account? Sign in
        </a>
      </div>
    </div>
  )
}

// ─── Human confirmation gate ─────────────────────────────────────────────────

function VerificationReadyScreen({
  verifying,
  error,
  onVerify,
}: {
  verifying: boolean
  error: string
  onVerify: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-neutral-200 bg-neutral-50">
        <Mail className="h-8 w-8 text-neutral-800" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-neutral-950">Confirm your email</h2>
        <p className="max-w-xs text-sm leading-relaxed text-neutral-700">
          Continue to verify your email address and choose your password.
        </p>
      </div>

      {error && (
        <div className="w-full max-w-xs rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onVerify}
        disabled={verifying}
        className={`${authPrimaryButton} h-11 w-auto px-6`}
      >
        {verifying ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Verifying…
          </>
        ) : (
          <>
            Verify email and continue
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  )
}

// ─── Redirecting Screen ───────────────────────────────────────────────────────

function RedirectingScreen() {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-4">
      <div className="relative">
        {/* Emerald stays: this is the confirmation that the account now exists. */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-emerald-200 bg-emerald-50">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-neutral-950">Account created</h2>
        <p className="text-sm leading-relaxed text-neutral-700">Redirecting you to sign in…</p>
      </div>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
    </div>
  )
}

// ─── Main Setup Password Page ─────────────────────────────────────────────────

export default function SetupPasswordPage() {
  const router  = useRouter()

  // Session verification state
  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionValid, setSessionValid] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [pendingVerification, setPendingVerification] = useState<{
    tokenHash: string
    type: 'email' | 'signup' | 'recovery'
  } | null>(null)
  const [verifyingEmail, setVerifyingEmail] = useState(false)
  const [verificationError, setVerificationError] = useState('')

  // Form state
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword,    setShowPassword]    = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [redirecting,     setRedirecting]     = useState(false)
  const [mounted,         setMounted]         = useState(false)

  const passwordRef = useRef<HTMLInputElement>(null)
  const verificationInFlight = useRef(false)

  const allCriteriaMet = PASSWORD_CRITERIA.every(c => c.test(password))
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const canSubmit      = allCriteriaMet && passwordsMatch && !loading && !redirecting

  function clearVerificationFragment() {
    if (window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  async function verifyPendingEmail() {
    if (!pendingVerification || verificationInFlight.current) return

    verificationInFlight.current = true
    setVerifyingEmail(true)
    setVerificationError('')

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          token_hash: pendingVerification.tokenHash,
          type: pendingVerification.type,
        }),
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearVerificationFragment()
          setPendingVerification(null)
          setTokenError('This verification link has expired or was already used. Enter your email below and we will send a new one.')
          return
        }

        setVerificationError('We could not verify your email right now. Please try again.')
        return
      }

      const session = await fetchSession()
      if (!session.authenticated || !session.emailConfirmedAt) {
        clearVerificationFragment()
        setPendingVerification(null)
        setTokenError('Your email could not be confirmed. Enter your email below and request a new link.')
        return
      }

      clearVerificationFragment()
      setPendingVerification(null)
      setSessionValid(true)
      setSessionChecked(true)
      setTimeout(() => passwordRef.current?.focus(), 100)
    } catch {
      setVerificationError('Check your internet connection and try again.')
    } finally {
      verificationInFlight.current = false
      setVerifyingEmail(false)
    }
  }

  // New confirmation emails use a TokenHash in the URL fragment and wait for
  // an explicit click before consuming it. Legacy PKCE and implicit links stay
  // supported so links already in an owner's inbox continue to work.
  useEffect(() => {
    setMounted(true)
    let cancelled = false

    async function initializeVerification() {
      try {
        const queryParams = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams((window.location.hash ?? '').replace(/^#/, ''))
        const tokenHash = hashParams.get('token_hash')
        const tokenType = hashParams.get('type')

        if (tokenHash) {
          const validToken = tokenHash.length >= 16 && tokenHash.length <= 1024 && !/\s/.test(tokenHash)
          const validType =
            tokenType === null ||
            tokenType === 'email' ||
            tokenType === 'signup' ||
            tokenType === 'recovery'

          if (!validToken || !validType) {
            if (!cancelled) {
              setTokenError('This confirmation link is invalid. Enter your email below and request a new link.')
              setSessionChecked(true)
            }
            return
          }

          // Keep the fragment until verification succeeds. Fragments are not
          // sent in HTTP requests, and retaining it lets a refresh recover from
          // a transient network failure without forcing another email.
          if (!cancelled) {
            setPendingVerification({
              tokenHash,
              type:
                tokenType === 'signup' || tokenType === 'recovery'
                  ? tokenType
                  : 'email',
            })
            setSessionChecked(true)
          }
          return
        }

        // GoTrue's /auth/v1/verify redirect returns its outcome in the URL
        // FRAGMENT, not the query string — verified against the live project:
        //   fresh link    -> #access_token=…&refresh_token=…&type=signup
        //   consumed link -> #error=access_denied&error_code=otp_expired&…
        // Reading the query alone meant an expired link fell through to the
        // generic "invalid or already used" branch instead of reporting the
        // real reason. Query is still checked for the legacy PKCE style, which
        // does put its error there.
        const providerError =
          hashParams.get('error_code') ??
          hashParams.get('error') ??
          queryParams.get('error_code') ??
          queryParams.get('error')

        if (providerError) {
          if (window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname)
          }
          if (!cancelled) {
            setTokenError(
              providerError === 'otp_expired'
                ? 'This verification link has expired or was already opened. Enter your email below and we will send a new one.'
                : 'This confirmation link is invalid. Enter your email below and request a new link.',
            )
            setSessionChecked(true)
          }
          return
        }

        const code = queryParams.get('code')
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (code) {
          const codeResponse = await fetch('/api/auth/exchange-code', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ code }),
          })

          if (!codeResponse.ok) {
            if (!cancelled) {
              setTokenError('This verification link has expired or cannot be opened in this browser. Enter your email below and request a new link.')
              setSessionChecked(true)
            }
            return
          }

          if (window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname)
          }
        } else if (accessToken && refreshToken) {
          const setResponse = await fetch('/api/auth/set-session', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
          })

          if (!setResponse.ok) {
            if (!cancelled) {
              setTokenError('This verification link has expired or was already used. Enter your email below and request a new link.')
              setSessionChecked(true)
            }
            return
          }

          if (window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname)
          }
        }

        const session = await fetchSession()
        if (cancelled) return

        if (!session.authenticated) {
          setTokenError('This confirmation link is invalid or was already used. Enter your email below and request a new link.')
          setSessionChecked(true)
          return
        }

        if (!session.emailConfirmedAt) {
          setTokenError('Your email address has not been confirmed yet. Open the latest verification email or request a new one below.')
          setSessionChecked(true)
          return
        }

        setSessionValid(true)
        setSessionChecked(true)
        setTimeout(() => passwordRef.current?.focus(), 100)
      } catch {
        if (!cancelled) {
          setTokenError('We could not verify this link. Check your internet connection or request a new email below.')
          setSessionChecked(true)
        }
      }
    }

    void initializeVerification()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError('')

    // ── Step 1: Set the real password (server-side) ────────────────────────
    // The endpoint applies the same criteria shown in the checklist above and
    // returns the friendly wording for the "same password" / stale-JWT cases.
    const updateResult = await updatePasswordViaApi(password)
    if (!updateResult.ok) {
      setError(updateResult.error)
      setLoading(false)
      return
    }

    // ── Step 2: Finalize registration (create gym row) ─────────────────────
    let finalizeRes: Response
    try {
      finalizeRes = await fetch('/api/auth/finalize-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      setError('Network error. Please check your connection and try again.')
      setLoading(false)
      return
    }

    if (!finalizeRes.ok && finalizeRes.status !== 409) {
      // 409 = gym already exists (idempotent success); anything else is a real error
      let message = 'Failed to complete registration. Please try again.'
      try {
        const json = await finalizeRes.json()
        if (json?.error?.message) message = json.error.message
      } catch { /* ignore parse error */ }
      setError(message)
      setLoading(false)
      return
    }

    // ── Step 3: Capture email before signing out ───────────────────────────
    const session = await fetchSession()
    const userEmail = session.email ?? ''

    // ── Step 4: Sign out so the user must explicitly log in ────────────────
    await signOutViaApi()

    // ── Step 5: Show redirect screen then navigate ─────────────────────────
    setLoading(false)
    setRedirecting(true)

    setTimeout(() => {
      // Broadcast success so the original signup tab can redirect too
      try {
        const bc = new BroadcastChannel('auth_channel')
        bc.postMessage({ type: 'registration_complete', email: userEmail })
        bc.close()
      } catch (e) { /* ignore if not supported */ }

      const params = new URLSearchParams({ registered: '1' })
      if (userEmail) params.set('email', userEmail)
      router.replace(`/auth/login?${params.toString()}`)
    }, 1000)
  }

  // ── Loading skeleton while session is being verified ──────────────────────
  if (!sessionChecked) {
    return (
      /* Plain white, no grid. This is a sub-second state before the session check
         resolves, and mounting a shader for it would be the one moment on the page where
         the backdrop competes with something that matters. */
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
          <p className="text-sm font-medium text-neutral-700">Verifying your link…</p>
        </div>
      </div>
    )
  }
  return (
    <AuthShell
      maxWidth={440}
      footer={<p className="text-xs text-neutral-700">Secured with end-to-end encryption</p>}
    >
      <div
        className={`transition-all duration-500 ${
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        {/* The step indicator moved out of the retired left panel and into the column.
            It was the one genuinely useful thing on that panel: this page is the middle
            of a three-step flow arrived at from an email, and saying so is orientation
            rather than marketing. Recoloured to neutral, with the completed step keeping
            emerald because "done" is information. */}
        {sessionValid && !redirecting && (
          <ol className="mb-7 flex flex-wrap items-center justify-center gap-2">
            {[
              { label: 'Email verified', done: true, active: false },
              { label: 'Set password', done: false, active: true },
              { label: 'Sign in', done: false, active: false },
            ].map((step, i) => (
              <li key={step.label} className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                    step.done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : step.active
                        ? 'border-neutral-300 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                  aria-current={step.active ? 'step' : undefined}
                >
                  {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
                  {step.label}
                </span>
                {i < 2 && <span aria-hidden className="h-px w-4 bg-neutral-300" />}
              </li>
            ))}
          </ol>
        )}

        {/* Scanner-safe TokenHash links wait for a real user click. */}
        {!sessionValid && pendingVerification && (
          <VerificationReadyScreen
            verifying={verifyingEmail}
            error={verificationError}
            onVerify={verifyPendingEmail}
          />
        )}

        {/* Invalid or expired legacy links offer cross-device resend recovery. */}
        {!sessionValid && !pendingVerification && <TokenErrorScreen message={tokenError} />}

        {sessionValid && redirecting && <RedirectingScreen />}

        {sessionValid && !redirecting && (
          <>
            <div className="mb-7">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-neutral-200 bg-neutral-50">
                <Lock className="h-6 w-6 text-neutral-800" />
              </div>
              <h1 className={authHeading}>Set your password</h1>
              <p className={authSub}>Choose a strong password to protect your account</p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3.5 text-sm font-semibold text-red-700"
              >
                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertCircle className="h-3 w-3 text-red-600" />
                </div>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="password-sp" className={authLabel}>
                  Password
                </label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="password-sp"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${authInput} pr-12`}
                    placeholder="Create a strong password"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <>
                    <StrengthBar password={password} />
                    <PasswordStrength password={password} />
                  </>
                )}
              </div>

              <div>
                <label htmlFor="confirm-sp" className={authLabel}>
                  Confirm password
                </label>
                <div className="relative">
                  {/* The match state keeps its red and emerald borders. That is the field
                      telling you whether the two values agree, which is the whole reason
                      the field exists, and it is mirrored in the wording below. */}
                  <input
                    id="confirm-sp"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`h-12 w-full rounded-xl border-2 bg-white px-4 pr-12 text-base font-medium text-neutral-900 transition-colors duration-150 placeholder:text-neutral-400 focus:outline-none focus:ring-4 sm:text-sm ${
                      confirmPassword.length > 0
                        ? passwordsMatch
                          ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/10'
                          : 'border-red-300 focus:border-red-400 focus:ring-red-400/10'
                        : 'border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900/10'
                    }`}
                    placeholder="Repeat your password"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p
                    className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
                      passwordsMatch ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {passwordsMatch ? (
                      <>
                        <Check className="h-3 w-3" strokeWidth={3} /> Passwords match
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3" /> Passwords do not match
                      </>
                    )}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className={`${authPrimaryButton} group mt-2`}
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating your account…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </AuthShell>
  )
}
