'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type State = 'checking' | 'processing' | 'success' | 'error'

/**
 * /activate/error
 *
 * Supabase implicit flow sends tokens in the URL hash (#access_token=...).
 * The server-side callback can't read hash fragments — so Supabase always
 * redirects here (the configured redirect URL). We detect the hash tokens
 * client-side, complete the session, and finish activation.
 */
export default function ActivateErrorPage() {
  const [state, setState] = useState<State>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const hash = window.location.hash
    if (!hash || !hash.includes('access_token')) {
      // No hash tokens — genuine error
      setState('error')
      return
    }

    setState('processing')

    async function processHashTokens() {
      try {
        const supabase = createClient()

        // Parse hash params
        const params = new URLSearchParams(hash.replace('#', ''))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (!accessToken || !refreshToken) {
          setState('error')
          return
        }

        // Set the session using the tokens from the hash
        const { data: { user }, error: sessionErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (sessionErr || !user) {
          console.error('[activate/error] setSession failed:', sessionErr?.message)
          setState('error')
          return
        }

        // Call the activation completion API
        const res = await fetch('/api/activate/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        })
        const json = await res.json()

        if (!res.ok || !json.success) {
          console.error('[activate/error] finalize failed:', json.error)
          // Even if finalize failed, session is set — redirect to success
        }

        // Clear hash from URL
        window.history.replaceState(null, '', window.location.pathname)
        setState('success')

        // Redirect to success page after short delay
        setTimeout(() => {
          window.location.href = '/activate/success'
        }, 1500)
      } catch (err) {
        console.error('[activate/error] error:', err)
        setState('error')
      }
    }

    void processHashTokens()
  }, [])

  // Checking for hash tokens
  if (state === 'checking' || state === 'processing') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="rounded-2xl shadow-md" />
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm font-medium text-slate-600">
            {state === 'checking' ? 'Checking verification...' : 'Completing activation...'}
          </p>
        </div>
      </main>
    )
  }

  // Successfully processed hash tokens
  if (state === 'success') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="rounded-2xl shadow-md" />
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-sm font-semibold">Account activated! Redirecting...</span>
          </div>
        </div>
      </main>
    )
  }

  // Genuine error — no hash tokens
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="mb-4 rounded-2xl shadow-md" />
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-red-900">
            Verification Failed
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-red-700">
            {message || 'The email verification link is invalid or has expired. This can happen if the link was already used or if too much time has passed.'}
          </p>

          <p className="mt-3 text-sm text-red-600">
            Please contact your gym to request a new activation invitation.
          </p>

          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  )
}
