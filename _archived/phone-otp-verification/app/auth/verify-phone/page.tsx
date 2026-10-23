'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, ArrowRight, MessageCircle, RefreshCw } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthAside } from '@/components/auth/AuthAside'
import { AUTH_ASIDE } from '@/components/auth/authAsideContent'
import {
  authHeading,
  authInput,
  authLabel,
  authPrimaryButton,
  authSecondaryButton,
  authSub,
} from '@/components/auth/authStyles'
import { CodeSlots } from '@/components/ui/CodeSlots'
import { api, GymFlowAPIError } from '@/lib/api/client'

type Step = 'checking' | 'number' | 'code'

const KNOWN_ERRORS = new Set([
  'INVALID_PHONE',
  'PHONE_IN_USE',
  'RATE_LIMITED',
  'OTP_SEND_FAILED',
  'INVALID_OTP',
  'TOO_MANY_ATTEMPTS',
])

const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default function VerifyPhonePage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('checking')
  const [mobile, setMobile] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [maskedPhone, setMaskedPhone] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [slotStatus, setSlotStatus] = useState<'idle' | 'verifying' | 'error' | 'success'>('idle')
  const verifyingRef = useRef(false)

  // Server-side the gym is only created after this succeeds; 409 means it already exists.
  async function finalize() {
    try {
      await api.post('/api/auth/finalize-registration')
    } catch (err) {
      if (!(err instanceof GymFlowAPIError && err.status === 409)) throw err
    }
    router.replace('/owner/onboarding')
    router.refresh()
  }

  function showError(err: unknown) {
    if (err instanceof GymFlowAPIError) {
      if (err.status === 401) {
        router.replace('/auth/login')
        return
      }
      setError(KNOWN_ERRORS.has(err.code) ? err.message : GENERIC_ERROR)
      return
    }
    setError('Network error. Please check your connection and try again.')
  }

  useEffect(() => {
    let cancelled = false
    api
      .get<{ data: { verified: boolean } }>('/api/auth/phone/status')
      .then(async (res) => {
        if (cancelled) return
        if (res.data.verified) {
          try {
            await finalize()
          } catch (err) {
            if (!cancelled) {
              setStep('number')
              showError(err)
            }
          }
        } else {
          setStep('number')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setStep('number')
        showError(err)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function sendCode() {
    if (busy || mobile.length !== 10) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ data: { maskedPhone: string; resendInSeconds: number } }>(
        '/api/auth/phone/request-otp',
        { mobileNumber: mobile, marketingConsent },
      )
      setMaskedPhone(res.data.maskedPhone)
      setCooldown(res.data.resendInSeconds || 30)
      setCode('')
      setSlotStatus('idle')
      setStep('code')
    } catch (err) {
      // Too many requests: the user is in the code step already on a resend, so keep the cooldown.
      if (err instanceof GymFlowAPIError && err.status === 429) setCooldown(30)
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function verify(value: string) {
    if (verifyingRef.current) return
    verifyingRef.current = true
    setError('')
    setSlotStatus('verifying')
    try {
      await api.post('/api/auth/phone/verify', { code: value })
      setSlotStatus('success')
      await finalize()
    } catch (err) {
      setSlotStatus('error')
      setCode('')
      showError(err)
      setTimeout(() => setSlotStatus('idle'), 600)
    } finally {
      verifyingRef.current = false
    }
  }

  function changeNumber() {
    setStep('number')
    setCode('')
    setError('')
    setSlotStatus('idle')
  }

  return (
    <AuthShell maxWidth={420} aside={<AuthAside {...AUTH_ASIDE.owner} note={undefined} />}>
      <div className="space-y-[var(--auth-gap-md)]">
        <div>
          <h1 className={authHeading}>Verify your mobile number</h1>
          <p className={authSub}>We send a 6-digit code on WhatsApp to confirm your number.</p>
        </div>

        {error && (
          <div
            role="alert"
            className="animate-slide-up flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3.5 text-sm font-semibold text-red-700"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 'checking' && (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        )}

        {step === 'number' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void sendCode()
            }}
            className="space-y-[var(--auth-gap-sm)]"
          >
            <div>
              <label htmlFor="verify-mobile" className={authLabel}>
                Mobile number
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 select-none text-sm font-semibold text-neutral-600">
                  +91
                </span>
                <input
                  id="verify-mobile"
                  type="tel"
                  inputMode="numeric"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className={`${authInput} pl-12`}
                  placeholder="10-digit number"
                  autoComplete="tel"
                  maxLength={10}
                  autoFocus
                />
              </div>
              <label htmlFor="verify-marketing" className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-neutral-700">
                <input
                  id="verify-marketing"
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-neutral-300 accent-brand-500"
                />
                <span>
                  I agree to receive GymFlow updates and offers on WhatsApp.{' '}
                  <a href="https://www.gymflow.sbs/privacy" target="_blank" rel="noopener noreferrer" className="text-xs font-medium underline">
                    Privacy policy
                  </a>
                </span>
              </label>
            </div>
            <button type="submit" disabled={busy || mobile.length !== 10} className={authPrimaryButton}>
              {busy ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <MessageCircle className="h-4 w-4" />
                  Send code on WhatsApp
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {step === 'code' && (
          <div className="space-y-[var(--auth-gap-sm)]">
            <p className="text-center text-sm text-neutral-700">
              Enter the code sent to{' '}
              <span className="font-semibold text-neutral-950">{maskedPhone || `+91 ${mobile}`}</span>
            </p>
            <CodeSlots value={code} onChange={setCode} onComplete={verify} status={slotStatus} />
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy || cooldown > 0}
              className={`${authSecondaryButton} h-11 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <RefreshCw className="h-4 w-4" />
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={changeNumber}
              className="mx-auto flex items-center gap-1.5 rounded text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Change number
            </button>
          </div>
        )}
      </div>
    </AuthShell>
  )
}
