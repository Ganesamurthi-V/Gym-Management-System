'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthAside } from '@/components/auth/AuthAside'
import { AUTH_ASIDE } from '@/components/auth/authAsideContent'
import {
  authHeading,
  authInput,
  authLabel,
  authPrimaryButton,
  authSub,
} from '@/components/auth/authStyles'
import { api, GymFlowAPIError } from '@/lib/api/client'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default function AddPhonePage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [mobile, setMobile] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Server-side the gym is only created once a number is saved; 409 means it already exists.
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
      if (err.status === 401 || err.code === 'UNAUTHORIZED') {
        router.replace('/auth/login')
        return
      }
      if (err.code === 'INVALID_PHONE') setError(err.message)
      else if (err.code === 'RATE_LIMITED') setError('Too many attempts. Please wait a moment and try again.')
      else setError(GENERIC_ERROR)
      return
    }
    setError('Network error. Please check your connection and try again.')
  }

  // A number already saved at email signup passes straight through: no form flash.
  useEffect(() => {
    let cancelled = false
    finalize()
      .catch((err) => {
        if (cancelled) return
        if (err instanceof GymFlowAPIError && err.status === 401) {
          router.replace('/auth/login')
          return
        }
        setChecking(false)
        if (!(err instanceof GymFlowAPIError && err.code === 'PHONE_REQUIRED')) showError(err)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit() {
    if (busy || mobile.length !== 10) return
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/phone/save', { mobileNumber: mobile, marketingConsent })
      await finalize()
    } catch (err) {
      showError(err)
      setBusy(false)
    }
  }

  return (
    <AuthShell maxWidth={420} aside={<AuthAside {...AUTH_ASIDE.owner} note={undefined} />}>
      <div className="space-y-[var(--auth-gap-md)]">
        <div>
          <h1 className={authHeading}>Add your mobile number</h1>
          <p className={authSub}>We use it to reach you about your gym account.</p>
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

        {checking ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            className="space-y-[var(--auth-gap-sm)]"
          >
            <div>
              <label htmlFor="add-mobile" className={authLabel}>
                Mobile number
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 select-none text-sm font-semibold text-neutral-600">
                  +91
                </span>
                <input
                  id="add-mobile"
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
              <label htmlFor="add-marketing" className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-neutral-700">
                <input
                  id="add-marketing"
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
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
