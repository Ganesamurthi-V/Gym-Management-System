'use client'

import { useState, useEffect, useRef } from 'react'
import { signOutViaApi } from '@/lib/auth/client-auth'
import {
  ArrowRight, Check, AlertCircle, PartyPopper, Mail, RefreshCw, ArrowLeft,
} from 'lucide-react'
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
  authSecondaryButton,
  authSub,
} from '@/components/auth/authStyles'

// ─── Email Sent Screen ────────────────────────────────────────────────────────

const RESEND_COOLDOWN = 60

function EmailSentScreen({ email }: { email: string }) {
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN)
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start countdown on mount
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current!)
  }, [])

  async function handleResend() {
    setResending(true)
    setResendStatus('idle')

    try {
      const res = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'signup' }),
      })

      setResending(false)

      if (!res.ok) {
        setResendStatus('error')
        setTimeout(() => setResendStatus('idle'), 4000)
      } else {
        setResendStatus('success')
        setCountdown(RESEND_COOLDOWN)
        clearInterval(intervalRef.current!)
        intervalRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(intervalRef.current!)
              return 0
            }
            return prev - 1
          })
        }, 1000)
        setTimeout(() => setResendStatus('idle'), 4000)
      }
    } catch {
      setResending(false)
      setResendStatus('error')
      setTimeout(() => setResendStatus('idle'), 4000)
    }
  }

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      {/* Icon. Neutral fill rather than the brand gradient; the emerald tick stays,
          since it is the thing confirming the send actually happened. */}
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-neutral-200 bg-neutral-50">
          <Mail className="h-9 w-9 text-neutral-800" />
        </div>
        <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow-md">
          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className={authHeading}>Check your inbox</h1>
        <p className="max-w-xs text-sm leading-relaxed text-neutral-700">
          We sent a confirmation link to
        </p>
        <p className="break-all rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950">
          {email}
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-neutral-700">
          Click the link in the email to set your password and activate your account. Check your
          spam folder if you don&apos;t see it.
        </p>
      </div>

      {/* Resend */}
      <div className="w-full space-y-3">
        {resendStatus === 'success' && (
          <div className="flex items-center gap-2 justify-center p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-semibold">
            <Check className="w-4 h-4" />
            Email resent successfully!
          </div>
        )}
        {resendStatus === 'error' && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <AlertCircle className="h-4 w-4" />
            Failed to resend. Please try again.
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={countdown > 0 || resending}
          className={`${authSecondaryButton} h-11 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {resending ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800" />
              Resending...
            </>
          ) : countdown > 0 ? (
            <>
              <RefreshCw className="h-4 w-4" />
              Resend in {countdown}s
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Resend email
            </>
          )}
        </button>
      </div>

      <button
        onClick={async () => {
          await signOutViaApi()
          window.location.href = '/auth/login'
        }}
        className="flex items-center gap-1.5 rounded text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to login
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ─── Main Create Account Page ─────────────────────────────────────────────────

export default function CreateAccountPage() {
  const [fullName, setFullName]       = useState('')
  const [email, setEmail]             = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedAuthority, setAgreedAuthority] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [mounted, setMounted]         = useState(false)
  const [emailSent, setEmailSent]     = useState(false)
  const isSubmitting                  = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  // Listen for the user setting their password in another tab (via email link)
  useEffect(() => {
    if (!emailSent) return
    let bc: BroadcastChannel | undefined
    try {
      bc = new BroadcastChannel('auth_channel')
      bc.onmessage = (event) => {
        if (event.data?.type === 'registration_complete') {
          const params = new URLSearchParams({ registered: '1' })
          if (event.data.email) params.set('email', event.data.email)
          window.location.href = `/auth/login?${params.toString()}`
        }
      }
    } catch (e) { /* ignore if unsupported */ }
    
    return () => { bc?.close() }
  }, [emailSent])

  const canSubmit =
    fullName.trim().length >= 2 &&
    isValidEmail(email) &&
    mobileNumber.length === 10 &&
    agreedTerms &&
    agreedAuthority &&
    !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || isSubmitting.current)  return

    isSubmitting.current = true
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          fullName: fullName.trim(),
          mobileNumber,
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.')
        setLoading(false)
        isSubmitting.current = false
        return
      }

      setLoading(false)
      setEmailSent(true)
      // Persist email so setup-password can use it for resend if the link expires
      try { sessionStorage.setItem('gymflow_signup_email', email) } catch { /* quota */ }
      isSubmitting.current = false
    } catch {
      setError('Network error. Please check your connection and try again.')
      setLoading(false)
      isSubmitting.current = false
    }
  }
  return (
    <AuthShell
      maxWidth={440}
      /*
        Always the owner column: this page only creates gym owner accounts. Members are
        provisioned by their gym and arrive through an activation link, never through here.

        It stays up on the confirm-your-email screen too. That screen asks the visitor to
        leave and go to their inbox, so the pitch is the last thing they read before
        deciding whether to come back.

        note is dropped here and only here. The form already states the trial terms, more
        precisely than the aside does and with the specifics that matter at the point of
        signing up — 14 days, Pro, activated automatically, no card. Keeping the aside's
        shorter version would put the same promise on screen twice, a few hundred pixels
        apart, which reads as marketing rather than information.
      */
      aside={<AuthAside {...AUTH_ASIDE.owner} note={undefined} />}
      footer={
        /* On the live grid, not inside the card. Original size, darker ink — see the note
           in AuthAside on why a passing ratio is not the whole story here. Dropped on short
           windows for the same reason as login's copy of it. */
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
        {emailSent ? (
          <EmailSentScreen email={email} />
        ) : (
          <>
            <div className="mb-[var(--auth-gap-md)]">
              <h1 className={authHeading}>Create your account</h1>
              <p className={authSub}>This will only take 2 minutes</p>
            </div>

            {error && (
              <div
                role="alert"
                className="animate-slide-up mb-5 flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3.5 text-sm font-semibold text-red-700"
              >
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertCircle className="h-3 w-3 text-red-600" />
                </div>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-[var(--auth-gap-sm)]">
              <div>
                <label htmlFor="full-name" className={authLabel}>
                  Your full name
                </label>
                <input
                  id="full-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={authInput}
                  placeholder="e.g., Rajesh Kumar"
                  required
                  autoComplete="name"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="email-ca" className={authLabel}>
                  Email address
                </label>
                <input
                  id="email-ca"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={authInput}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="mobile-ca" className={authLabel}>
                  Mobile number
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 select-none text-sm font-semibold text-neutral-600">
                    +91
                  </span>
                  <input
                    id="mobile-ca"
                    type="tel"
                    inputMode="numeric"
                    value={mobileNumber}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                      setMobileNumber(digits)
                    }}
                    className={`${authInput} pl-12`}
                    placeholder="10-digit number"
                    required
                    autoComplete="tel"
                    maxLength={10}
                  />
                </div>
                {/* Amber and emerald stay: these are state, not decoration. */}
                {mobileNumber.length > 0 && mobileNumber.length < 10 && (
                  <p className="mt-1.5 text-xs font-medium text-amber-700">
                    {10 - mobileNumber.length} more digit{10 - mobileNumber.length !== 1 ? 's' : ''} needed
                  </p>
                )}
                {mobileNumber.length === 10 && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <Check className="h-3 w-3" /> Looks good
                  </p>
                )}
              </div>

              {/* Agreements. The panel is an opaque neutral fill, so the grid never sits
                  behind this text and the checkbox marks read cleanly. */}
              <div className={`${authPanel} space-y-3`}>
                <p className="text-sm font-semibold text-neutral-950">Required agreements</p>

                <label className="group flex cursor-pointer items-start gap-3">
                  <span className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={agreedTerms}
                      onChange={(e) => setAgreedTerms(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-900 peer-focus-visible:ring-offset-2 ${
                        agreedTerms
                          ? 'border-neutral-950 bg-carbon-950 dark:border-neutral-900 dark:bg-neutral-900'
                          : 'border-neutral-300 bg-surface group-hover:border-neutral-500'
                      }`}
                    >
                      {/* The tick sits on a tile that inverts, so it inverts too — see the
                          note on authPrimaryButton for why these few controls need explicit
                          dark rules instead of a themed colour. */}
                      {agreedTerms && <Check className="h-3 w-3 text-white dark:text-carbon-950" strokeWidth={3} />}
                    </span>
                  </span>
                  <span className="text-sm leading-relaxed text-neutral-700">
                    I have read and agree to the{' '}
                    <a href="/terms" className={authLink}>
                      Terms &amp; Conditions
                    </a>{' '}
                    <span className="text-neutral-600">(Required)</span>
                  </span>
                </label>

                <label className="group flex cursor-pointer items-start gap-3">
                  <span className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={agreedAuthority}
                      onChange={(e) => setAgreedAuthority(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-900 peer-focus-visible:ring-offset-2 ${
                        agreedAuthority
                          ? 'border-neutral-950 bg-carbon-950 dark:border-neutral-900 dark:bg-neutral-900'
                          : 'border-neutral-300 bg-surface group-hover:border-neutral-500'
                      }`}
                    >
                      {agreedAuthority && <Check className="h-3 w-3 text-white dark:text-carbon-950" strokeWidth={3} />}
                    </span>
                  </span>
                  <span className="text-sm leading-relaxed text-neutral-700">
                    I confirm that I have the authority to represent my gym or organisation and
                    bind it to these Terms <span className="text-neutral-600">(Required)</span>
                  </span>
                </label>
              </div>

              <div className={`flex items-start gap-3 ${authPanel}`}>
                <PartyPopper className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-500" />
                <p className="text-sm leading-relaxed text-neutral-700">
                  <span className="font-semibold text-neutral-950">
                    Your account includes a free 14 day Pro trial
                  </span>
                  {' — '}full access to all features, automatically activated. No credit card
                  required.
                </p>
              </div>

              <button type="submit" disabled={!canSubmit} className={`${authPrimaryButton} group`}>
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Sending verification email...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Verify email
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

            <p className="text-center text-sm text-neutral-700">
              Already have an account?{' '}
              <a href="/auth/login" className={authLink}>
                Sign in
              </a>
            </p>
          </>
        )}
      </div>
    </AuthShell>
  )
}
