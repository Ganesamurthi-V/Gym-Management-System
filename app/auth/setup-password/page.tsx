'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { fetchSession, signOutViaApi, updatePasswordViaApi } from '@/lib/auth/client-auth'
import {
  Eye, EyeOff, Shield, Check, AlertCircle, ArrowRight, Lock, ArrowLeft,
} from 'lucide-react'

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
            className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 ${ok ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${ok ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
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
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[11px] font-bold ${color.replace('bg-', 'text-')}`}>{label}</p>
    </div>
  )
}

// ─── Token Error Screen ───────────────────────────────────────────────────────

function TokenErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-4">
      <div className="w-16 h-16 rounded-2xl bg-red-50 border-2 border-red-200 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-black text-[#0F172A]">Link expired or invalid</h2>
        <p className="text-sm text-slate-500 leading-relaxed max-w-xs">{message}</p>
      </div>
      <a
        href="/auth/create-account"
        className="flex items-center gap-2 px-6 h-11 bg-[#0F172A] text-white text-sm font-bold rounded-xl hover:bg-[#1E293B] transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Sign Up
      </a>
      <a href="/auth/login" className="text-sm text-brand-600 font-bold hover:text-brand-700 transition-colors">
        Already have an account? Sign in
      </a>
    </div>
  )
}

// ─── Redirecting Screen ───────────────────────────────────────────────────────

function RedirectingScreen() {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
          <Check className="w-8 h-8 text-emerald-500" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-black text-[#0F172A]">Account created!</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Redirecting you to sign in…
        </p>
      </div>
      <div className="w-6 h-6 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
}

// ─── Main Setup Password Page ─────────────────────────────────────────────────

export default function SetupPasswordPage() {
  const router  = useRouter()
  const supabase = createClient()

  // Session verification state
  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionValid,   setSessionValid]   = useState(false)
  const [tokenError,     setTokenError]     = useState('')

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

  const allCriteriaMet = PASSWORD_CRITERIA.every(c => c.test(password))
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const canSubmit      = allCriteriaMet && passwordsMatch && !loading && !redirecting

  // ── On mount: exchange URL hash token then verify session ─────────────────
  //
  // NOTE — this is the one place the Supabase browser client is still required.
  // The confirmation email lands here as
  //   /auth/setup-password#access_token=…&refresh_token=…
  // and a URL *fragment* is never transmitted to the server, so no API route can
  // see those tokens. `@supabase/ssr`'s browser client reads the fragment and
  // writes the session into cookies, which is what makes the server endpoints
  // below (update-password, session, signout) work at all.
  //
  // Eliminating this would mean pointing `emailRedirectTo` at a server route
  // that receives `?code=` or `?token_hash=` instead — a change to the Supabase
  // email template, which also invalidates links already sitting in inboxes.
  // Tracked as follow-up; see docs/GymFlow_API_Gateway_Migration.md.
  useEffect(() => {
    setMounted(true)

    // Wait a short tick to let that fragment exchange complete, then read the
    // session from the client that performed it.
    const timer = setTimeout(async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        setTokenError(
          'This confirmation link is invalid or has already been used. Please request a new one from the sign-up page.'
        )
        setSessionChecked(true)
        return
      }

      if (!session.user.email_confirmed_at) {
        setTokenError(
          'Your email address has not been confirmed yet. Please click the verification link in your inbox.'
        )
        setSessionChecked(true)
        return
      }

      setSessionValid(true)
      setSessionChecked(true)
      setTimeout(() => passwordRef.current?.focus(), 100)
    }, 400)

    return () => clearTimeout(timer)
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
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Verifying your link…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── LEFT PANEL ─── */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-[#0B0F1A] flex-col items-center justify-center p-10 xl:p-14 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-brand-400/20 to-violet-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-15%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tr from-cyan-400/15 to-emerald-400/10 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />

        <div className={`relative z-10 space-y-8 text-center transition-all duration-700 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-brand-400/20 to-brand-600/10 border border-brand-400/20 flex items-center justify-center">
            <Lock className="w-12 h-12 text-brand-300" />
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl font-black text-white leading-tight">
              Almost there!<br />
              <span className="bg-gradient-to-r from-brand-300 to-cyan-400 bg-clip-text text-transparent">
                Set your password
              </span>
            </h2>
            <p className="text-sm text-white/40 max-w-xs leading-relaxed">
              Your email is verified. Choose a strong password to secure your account, then sign in.
            </p>
          </div>

          {/* Steps indicator */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {[
              { label: 'Email verified', done: true,  active: false },
              { label: 'Set password',   done: false, active: true  },
              { label: 'Sign in',        done: false, active: false },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${
                  step.done
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : step.active
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                    : 'bg-white/5 text-white/30 border border-white/10'
                }`}>
                  {step.done   && <Check className="w-3 h-3" strokeWidth={3} />}
                  {step.active && <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />}
                  {step.label}
                </div>
                {i < 2 && <div className="w-4 h-px bg-white/10" />}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-10 flex items-center gap-3">
          <Image src="/logo_only.png" alt="GymFlow" width={32} height={32} className="object-contain" />
          <span className="text-sm font-black text-white/60">gymflow</span>
        </div>
      </div>

      {/* ─── RIGHT PANEL ─── */}
      <div className="flex-1 flex flex-col bg-[#FAFBFD] lg:bg-white min-w-0">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 p-4 xs:p-6 pb-0">
          <div className="w-8 h-8 xs:w-9 xs:h-9 flex items-center justify-center">
            <Image src="/logo_only.png" alt="GymFlow Logo" width={36} height={36} className="object-contain drop-shadow-sm" />
          </div>
          <span className="text-base xs:text-lg font-black text-slate-900 tracking-tight">gymflow</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 xs:px-6 py-8 xs:py-10">
          <div className={`w-full max-w-[440px] transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

            {/* Token error */}
            {!sessionValid && (
              <TokenErrorScreen message={tokenError} />
            )}

            {/* Redirecting overlay */}
            {sessionValid && redirecting && (
              <RedirectingScreen />
            )}

            {/* Password form */}
            {sessionValid && !redirecting && (
              <>
                <div className="mb-7 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 border-2 border-brand-100 mb-4">
                    <Lock className="w-6 h-6 text-brand-500" />
                  </div>
                  <h2 className="text-2xl xs:text-3xl font-black text-[#0F172A] tracking-tight">Set your password</h2>
                  <p className="text-sm text-slate-400 mt-1.5 font-medium">Choose a strong password to protect your account</p>
                </div>

                {error && (
                  <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-semibold">
                    <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertCircle className="w-3 h-3 text-red-500" />
                    </div>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Password */}
                  <div>
                    <label htmlFor="password-sp" className="block text-sm font-bold text-[#0F172A] mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        ref={passwordRef}
                        id="password-sp"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full h-12 px-4 pr-12 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all duration-200"
                        placeholder="Create a strong password"
                        required
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {password.length > 0 && (
                      <>
                        <StrengthBar password={password} />
                        <PasswordStrength password={password} />
                      </>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label htmlFor="confirm-sp" className="block text-sm font-bold text-[#0F172A] mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-sp"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className={`w-full h-12 px-4 pr-12 bg-white border-2 rounded-xl text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:ring-4 transition-all duration-200 ${
                          confirmPassword.length > 0
                            ? passwordsMatch
                              ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/10'
                              : 'border-red-300 focus:border-red-400 focus:ring-red-400/10'
                            : 'border-slate-200 focus:border-brand-500 focus:ring-brand-500/10'
                        }`}
                        placeholder="Repeat your password"
                        required
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && (
                      <p className={`mt-1.5 text-xs font-medium flex items-center gap-1 ${passwordsMatch ? 'text-emerald-600' : 'text-red-500'}`}>
                        {passwordsMatch
                          ? <><Check className="w-3 h-3" strokeWidth={3} /> Passwords match</>
                          : <><AlertCircle className="w-3 h-3" /> Passwords do not match</>
                        }
                      </p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full h-12 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/20 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed group mt-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creating your account…
                      </>
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-slate-300 font-medium">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Secured with end-to-end encryption</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
