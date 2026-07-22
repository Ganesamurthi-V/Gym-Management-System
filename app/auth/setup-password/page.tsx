'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  Eye, EyeOff, Shield, Check, AlertCircle, ArrowRight, Lock,
  ArrowLeft,
} from 'lucide-react'

// ─── Password Criteria ────────────────────────────────────────────────────────

interface Criterion {
  label: string
  test: (pw: string) => boolean
}

const PASSWORD_CRITERIA: Criterion[] = [
  { label: 'At least 8 characters',         test: pw => pw.length >= 8 },
  { label: 'At most 128 characters',         test: pw => pw.length <= 128 && pw.length > 0 },
  { label: 'One uppercase letter (A–Z)',     test: pw => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter (a–z)',     test: pw => /[a-z]/.test(pw) },
  { label: 'One digit (0–9)',                test: pw => /\d/.test(pw) },
  { label: 'One special character (!@#…)',   test: pw => /[^A-Za-z0-9]/.test(pw) },
]

function PasswordStrength({ password }: { password: string }) {
  return (
    <div className="mt-3 space-y-1.5">
      {PASSWORD_CRITERIA.map(c => {
        const ok = c.test(password)
        return (
          <div
            key={c.label}
            className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 ${
              ok ? 'text-emerald-600' : 'text-slate-400'
            }`}
          >
            <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
              ok ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
            }`}>
              <Check className={`w-2.5 h-2.5 transition-opacity duration-200 ${ok ? 'opacity-100' : 'opacity-30'}`} strokeWidth={3} />
            </div>
            {c.label}
          </div>
        )
      })}
    </div>
  )
}

// ─── Strength Bar ─────────────────────────────────────────────────────────────

function strengthScore(password: string): number {
  return PASSWORD_CRITERIA.filter(c => c.test(password)).length
}

function StrengthBar({ password }: { password: string }) {
  if (!password) return null
  const score = strengthScore(password)
  const pct = Math.round((score / PASSWORD_CRITERIA.length) * 100)

  let color = 'bg-red-400'
  let label = 'Weak'
  if (score >= 4) { color = 'bg-amber-400'; label = 'Fair' }
  if (score >= 5) { color = 'bg-emerald-400'; label = 'Strong' }
  if (score === 6) { color = 'bg-emerald-500'; label = 'Very strong' }

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-[11px] font-bold ${color.replace('bg-', 'text-')}`}>{label}</p>
    </div>
  )
}

// ─── Error Screen ─────────────────────────────────────────────────────────────

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

// ─── Main Setup Password Page ─────────────────────────────────────────────────

export default function SetupPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionValid, setSessionValid]     = useState(false)
  const [tokenError, setTokenError]         = useState('')

  const [password, setPassword]             = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword]     = useState(false)
  const [showConfirm, setShowConfirm]       = useState(false)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')
  const [mounted, setMounted]               = useState(false)

  const passwordRef = useRef<HTMLInputElement>(null)

  const allCriteriaMet = PASSWORD_CRITERIA.every(c => c.test(password))
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const canSubmit      = allCriteriaMet && passwordsMatch && !loading

  // ── On mount: let Supabase exchange the URL hash token, then verify session
  useEffect(() => {
    setMounted(true)

    // Supabase SSR automatically exchanges the #access_token= hash on navigation.
    // We just wait a tick then check the resulting session.
    const timer = setTimeout(async () => {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session) {
        setTokenError(
          'This confirmation link is invalid or has expired. Please request a new one from the sign-up page.'
        )
        setSessionChecked(true)
        return
      }

      // Confirm the user's email is now verified
      if (!session.user.email_confirmed_at) {
        setTokenError(
          'Your email has not been confirmed yet. Please click the link in your confirmation email.'
        )
        setSessionChecked(true)
        return
      }

      setSessionValid(true)
      setSessionChecked(true)

      // Auto-focus password field
      setTimeout(() => passwordRef.current?.focus(), 100)
    }, 300)

    return () => clearTimeout(timer)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError('')

    // 1. Set the real password
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // 2. Create the minimal gym record (idempotent)
    try {
      const res = await fetch('/api/auth/finalize-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        // Non-fatal: the onboarding page can still handle a missing gym row.
        // Only hard-fail on unexpected server errors; 409 conflict = already created.
        if (res.status !== 409) {
          console.warn('finalize-registration warning:', json?.error?.message)
        }
      }
    } catch (networkErr) {
      // Non-fatal: proceed to onboarding where gym creation is retried
      console.warn('finalize-registration network error:', networkErr)
    }

    // 3. Get current user email for redirect
    const { data: { user } } = await supabase.auth.getUser()
    const emailParam = user?.email ? `&email=${encodeURIComponent(user.email)}` : ''

    // 4. Redirect to onboarding wizard
    router.push('/onboarding')
  }

  // ── Loading skeleton while session is being checked
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
        {/* Background orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-brand-400/20 to-violet-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-15%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tr from-cyan-400/15 to-emerald-400/10 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />

        <div className={`relative z-10 space-y-8 text-center transition-all duration-700 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          {/* Lock icon */}
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
              You&apos;re one step away from your gym management dashboard. Choose a strong password to secure your account.
            </p>
          </div>

          {/* Steps indicator */}
          <div className="flex items-center gap-3 justify-center">
            {['Email verified', 'Set password', 'Setup gym'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${
                  i === 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : i === 1
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                    : 'bg-white/5 text-white/30 border border-white/10'
                }`}>
                  {i === 0 && <Check className="w-3 h-3" strokeWidth={3} />}
                  {i === 1 && <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />}
                  {step}
                </div>
                {i < 2 && <div className="w-4 h-px bg-white/10" />}
              </div>
            ))}
          </div>
        </div>

        {/* Logo bottom-left */}
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

            {/* Token error state */}
            {!sessionValid ? (
              <TokenErrorScreen message={tokenError} />
            ) : (
              <>
                {/* Heading */}
                <div className="mb-7 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 border-2 border-brand-100 mb-4">
                    <Lock className="w-6 h-6 text-brand-500" />
                  </div>
                  <h2 className="text-2xl xs:text-3xl font-black text-[#0F172A] tracking-tight">Set your password</h2>
                  <p className="text-sm text-slate-400 mt-1.5 font-medium">Choose a strong password to protect your account</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-5 flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-semibold">
                    <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-3 h-3 text-red-500" />
                    </div>
                    {error}
                  </div>
                )}

                {/* Form */}
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
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
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
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && (
                      <p className={`mt-1.5 text-xs font-medium flex items-center gap-1 ${passwordsMatch ? 'text-emerald-600' : 'text-red-500'}`}>
                        {passwordsMatch ? (
                          <><Check className="w-3 h-3" strokeWidth={3} /> Passwords match</>
                        ) : (
                          <><AlertCircle className="w-3 h-3" /> Passwords do not match</>
                        )}
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

                {/* Security badge */}
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
