'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowRight, Users, TrendingUp, Shield, Zap,
  Check, AlertCircle, PartyPopper, Mail, RefreshCw, ArrowLeft,
} from 'lucide-react'

// ─── Animated Grid Background ────────────────────────────────────────────────

function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-brand-400/20 to-violet-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-cyan-400/15 to-emerald-400/10 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
      <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] bg-gradient-to-r from-brand-500/10 to-purple-500/10 rounded-full blur-[60px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '4s' }} />
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-ca" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-ca)" />
      </svg>
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
              animation: `float-particle-ca ${(6 + r3 * 8).toFixed(2)}s ease-in-out infinite`,
              animationDelay: `${(r4 * 5).toFixed(2)}s`,
            }}
          />
        )
      })}
    </div>
  )
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

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

// ─── Email Sent Screen ────────────────────────────────────────────────────────

const RESEND_COOLDOWN = 60

function EmailSentScreen({ email }: { email: string }) {
  const supabase = createClient()
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

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/setup-password`,
      },
    })

    setResending(false)

    if (error) {
      setResendStatus('error')
      setTimeout(() => setResendStatus('idle'), 4000)
    } else {
      setResendStatus('success')
      // Reset countdown
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
  }

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      {/* Icon */}
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 border-2 border-brand-200 flex items-center justify-center shadow-lg shadow-brand-500/10">
          <Mail className="w-9 h-9 text-brand-500" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        </div>
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-[#0F172A] tracking-tight">Check your inbox</h2>
        <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-xs">
          We sent a confirmation link to
        </p>
        <p className="text-sm font-bold text-[#0F172A] bg-slate-100 px-4 py-2 rounded-xl break-all">
          {email}
        </p>
        <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
          Click the link in the email to set your password and activate your account. Check your spam folder if you don&apos;t see it.
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
          <div className="flex items-center gap-2 justify-center p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-semibold">
            <AlertCircle className="w-4 h-4" />
            Failed to resend. Please try again.
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={countdown > 0 || resending}
          className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resending ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              Resending...
            </>
          ) : countdown > 0 ? (
            <>
              <RefreshCw className="w-4 h-4" />
              Resend in {countdown}s
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Resend Email
            </>
          )}
        </button>
      </div>

      {/* Back to login */}
      <button
        onClick={async () => {
          await supabase.auth.signOut()
          window.location.href = '/auth/login'
        }}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-brand-600 font-medium transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Login
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
  const supabase = createClient()

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
    if (!canSubmit || isSubmitting.current) return

    isSubmitting.current = true
    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/setup-password`

    setLoading(true)
    setError('')

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: crypto.randomUUID(),
      options: {
        data: {
          full_name: fullName.trim(),
          name: fullName.trim(),
          mobile_number: mobileNumber,
        },
        emailRedirectTo: redirectUrl,
      },
    })

    // Detect if Supabase returned a "fake" success due to Email Enumeration Protection.
    // If the user already exists, Supabase returns error: null but an empty identities array.
    if (!signUpError && signUpData?.user?.identities?.length === 0) {
      setError('An account with this email already exists. Try signing in instead.')
      setLoading(false)
      isSubmitting.current = false
      return
    }

    if (signUpError) {
      // Surface a friendly message for common cases (fallback for when enumeration protection is off)
      if (signUpError.message.toLowerCase().includes('already registered')) {
        setError('An account with this email already exists. Try signing in instead.')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      isSubmitting.current = false
      return
    }

    setLoading(false)
    setEmailSent(true)
    isSubmitting.current = false
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── LEFT PANEL ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-[#0B0F1A] flex-col p-10 xl:p-14 overflow-hidden">
        <GridBackground />

        {/* Logo */}
        <div className={`relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <Image src="/logo_only.png" alt="GymFlow Logo" width={40} height={40} className="object-contain drop-shadow-md" />
            </div>
            <span className="text-lg font-black text-white tracking-tight">gymflow</span>
          </div>
        </div>

        {/* Hero */}
        <div className={`relative z-10 mt-16 xl:mt-24 space-y-8 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-400/20">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              <span className="text-[11px] font-bold text-brand-300 uppercase tracking-wider">Get Started for Free</span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight">
              Join<br />
              <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-cyan-400 bg-clip-text text-transparent">
                gymflow
              </span>
            </h1>
            <p className="text-base text-white/40 max-w-md leading-relaxed font-medium">
              The complete gym management platform trusted by gym owners across Tamil Nadu and Pondicherry.
            </p>
          </div>
          <div className="space-y-3 max-w-md">
            <FeatureCard icon={<Users className="w-4 h-4 text-brand-300" />} title="Member Management" description="Track memberships, attendance, and renewals effortlessly" delay={400} />
            <FeatureCard icon={<TrendingUp className="w-4 h-4 text-emerald-300" />} title="Smart Dashboard" description="Get insights into your gym's performance at a glance" delay={600} />
            <FeatureCard icon={<Shield className="w-4 h-4 text-amber-300" />} title="Fast & Secure" description="Your data is completely secure and accessible anywhere" delay={800} />
          </div>
        </div>

        {/* Bottom */}
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
          <div className={`w-full max-w-[440px] transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

            {/* ── Email Sent State ── */}
            {emailSent ? (
              <EmailSentScreen email={email} />
            ) : (
              <>
                {/* Heading */}
                <div className="mb-7 xs:mb-8 text-center">
                  <h2 className="text-2xl xs:text-3xl font-black text-[#0F172A] tracking-tight">Create your account</h2>
                  <p className="text-sm text-slate-400 mt-1.5 font-medium">This will only take 2 minutes</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-5 flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-semibold animate-slide-up">
                    <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-3 h-3 text-red-500" />
                    </div>
                    {error}
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">

                  {/* Full Name */}
                  <div>
                    <label htmlFor="full-name" className="block text-sm font-bold text-[#0F172A] mb-2">
                      Your Full Name
                    </label>
                    <input
                      id="full-name"
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full h-12 px-4 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all duration-200"
                      placeholder="e.g., Rajesh Kumar"
                      required
                      autoComplete="name"
                      autoFocus
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="email-ca" className="block text-sm font-bold text-[#0F172A] mb-2">
                      Email Address
                    </label>
                    <input
                      id="email-ca"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full h-12 px-4 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all duration-200"
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                  </div>

                  {/* Mobile Number */}
                  <div>
                    <label htmlFor="mobile-ca" className="block text-sm font-bold text-[#0F172A] mb-2">
                      Mobile Number
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 pointer-events-none select-none">
                        +91
                      </span>
                      <input
                        id="mobile-ca"
                        type="tel"
                        inputMode="numeric"
                        value={mobileNumber}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                          setMobileNumber(digits)
                        }}
                        className="w-full h-12 pl-12 pr-4 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder:text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all duration-200"
                        placeholder="10-digit number"
                        required
                        autoComplete="tel"
                        maxLength={10}
                      />
                    </div>
                    {mobileNumber.length > 0 && mobileNumber.length < 10 && (
                      <p className="mt-1.5 text-xs text-amber-600 font-medium">
                        {10 - mobileNumber.length} more digit{10 - mobileNumber.length !== 1 ? 's' : ''} needed
                      </p>
                    )}
                    {mobileNumber.length === 10 && (
                      <p className="mt-1.5 text-xs text-emerald-600 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3" /> Looks good
                      </p>
                    )}
                  </div>

                  {/* Required Agreements */}
                  <div className="p-4 rounded-xl bg-brand-50 border border-brand-100 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-brand-500" />
                      <span className="text-sm font-bold text-[#0F172A]">Required Agreements</span>
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex-shrink-0 mt-0.5">
                        <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)} className="sr-only" />
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${agreedTerms ? 'bg-brand-500 border-brand-500' : 'bg-white border-slate-300 group-hover:border-brand-400'}`}>
                          {agreedTerms && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </div>
                      <span className="text-sm text-slate-600 leading-relaxed font-medium">
                        I have read and agree to the{' '}
                        <a href="/terms" className="text-brand-600 font-bold underline underline-offset-2 hover:text-brand-700 transition-colors">
                          Terms &amp; Conditions
                        </a>{' '}
                        <span className="text-slate-400">(Required)</span>
                      </span>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex-shrink-0 mt-0.5">
                        <input type="checkbox" checked={agreedAuthority} onChange={e => setAgreedAuthority(e.target.checked)} className="sr-only" />
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${agreedAuthority ? 'bg-brand-500 border-brand-500' : 'bg-white border-slate-300 group-hover:border-brand-400'}`}>
                          {agreedAuthority && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </div>
                      <span className="text-sm text-slate-600 leading-relaxed font-medium">
                        I confirm that I have the authority to represent my gym/organization and bind it to these Terms{' '}
                        <span className="text-slate-400">(Required)</span>
                      </span>
                    </label>
                  </div>

                  {/* 14-day trial banner */}
                  <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <PartyPopper className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-600 leading-relaxed">
                      <span className="font-bold text-[#0F172A]">Your account includes a free 14 days Pro trial</span>
                      {' — '}full access to all features, automatically activated. No credit card required.
                    </p>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full h-12 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/20 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed group"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending verification email...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Verify Email
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-4 my-6">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Sign in link */}
                <div className="text-center">
                  <p className="text-sm text-slate-400 font-medium">
                    Already have an account?{' '}
                    <a href="/auth/login" className="text-brand-600 font-bold hover:text-brand-700 transition-colors">
                      Sign in
                    </a>
                  </p>
                </div>

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

      <style>{`
        @keyframes float-particle-ca {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.5; }
          50% { transform: translateY(-10px) translateX(-5px); opacity: 0.3; }
          75% { transform: translateY(-30px) translateX(15px); opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
