'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Loader2, MailWarning, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { loadActivation, clearActivation } from '@/lib/activation-store'

type State = 'processing' | 'success' | 'consumed' | 'error'

/**
 * /activate/verifying
 *
 * Landing page for the emailed verification link.
 *
 * Supabase's implicit flow returns tokens in the URL *fragment*, which servers
 * cannot read, so /api/activate/callback forwards here and this component reads
 * `window.location.hash`.
 *
 * The important case this page adds is `otp_expired`. Supabase magic links are
 * single use, and mail providers / link previewers / antivirus scanners fetch
 * links automatically — which consumes the token before the member taps it.
 * That is the reported "link expired after 5-10 seconds". Previously this landed
 * on /activate/error, which said "contact your gym" and offered no way out.
 * Here the member gets a one-tap resend.
 */
export default function VerifyingPage() {
  const [state, setState] = useState<State>('processing')
  const [detail, setDetail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [canResend, setCanResend] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  /** Ask the server whether this member is already activated. */
  const confirmActivated = useCallback(async (token: string, memberId: string) => {
    try {
      const res = await fetch('/api/activate/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, memberId }),
      })
      const json = await res.json()
      return json?.activated === true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      const hash = window.location.hash ?? ''
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
      const queryParams = new URLSearchParams(window.location.search)

      const hashError = hashParams.get('error_code') ?? hashParams.get('error')
      const queryError = queryParams.get('failed')
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      const stash = loadActivation()

      // ── Link was already consumed, or otherwise rejected ──────────────────
      if (!accessToken && (hashError || queryError)) {
        const reason = hashError ?? queryError ?? ''

        // A scanner may have burned the link AFTER a real activation completed,
        // so confirm before showing a failure.
        if (stash && (await confirmActivated(stash.token, stash.memberId))) {
          if (cancelled) return
          clearActivation()
          setState('success')
          return
        }

        if (cancelled) return
        const expired = /otp_expired|expired|access_denied/i.test(reason)
        setState(expired ? 'consumed' : 'error')
        setDetail(reason)
        setCanResend(Boolean(stash))
        return
      }

      // ── No tokens and no error — nothing to process ───────────────────────
      if (!accessToken || !refreshToken) {
        if (stash && (await confirmActivated(stash.token, stash.memberId))) {
          if (cancelled) return
          clearActivation()
          setState('success')
          return
        }
        if (cancelled) return
        setState('error')
        setDetail('no_tokens')
        setCanResend(Boolean(stash))
        return
      }

      // ── Success path: establish the session, then finalise activation ─────
      try {
        const supabase = createClient()
        const { data: { user }, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error || !user) {
          if (cancelled) return
          setState('error')
          setDetail(error?.message ?? 'session_failed')
          setCanResend(Boolean(stash))
          return
        }

        const res = await fetch('/api/activate/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        })
        const json = await res.json()

        if (cancelled) return

        if (!res.ok || !json.success) {
          // The session exists but the DB write failed. Surface it rather than
          // claiming success — the member would otherwise hit a portal that
          // still thinks they are not activated.
          setState('error')
          setDetail(json?.error ?? 'finalize_failed')
          setCanResend(Boolean(stash))
          return
        }

        clearActivation()
        window.history.replaceState(null, '', window.location.pathname)
        setState('success')
        setTimeout(() => { window.location.href = '/activate/success' }, 1200)
      } catch (err) {
        if (cancelled) return
        console.error('[activate/verifying]', err)
        setState('error')
        setDetail('unexpected')
        setCanResend(Boolean(stash))
      }
    }

    void run()
    return () => { cancelled = true }
  }, [confirmActivated])

  async function handleResend() {
    const stash = loadActivation()
    if (!stash) return

    setResending(true)
    setResendMsg('')
    try {
      const res = await fetch('/api/activate/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: stash.token }),
      })
      const json = await res.json()

      if (json?.alreadyActivated) {
        clearActivation()
        setState('success')
        return
      }

      if (!res.ok || !json.success) {
        setResendMsg(json?.error ?? 'Could not resend. Please try again.')
        if (json?.retryAfterSeconds) setCooldown(Number(json.retryAfterSeconds))
        return
      }

      setResendMsg(`A new link was sent to ${json.email ?? stash.email}. Open it from this device if you can.`)
      setCooldown(60)
    } catch {
      setResendMsg('Network error. Please try again.')
    } finally {
      setResending(false)
    }
  }

  if (state === 'processing') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="rounded-2xl shadow-md" />
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm font-medium text-slate-600">Completing activation…</p>
        </div>
      </main>
    )
  }

  if (state === 'success') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="rounded-2xl shadow-md" />
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-sm font-semibold">Account activated! Redirecting…</span>
          </div>
        </div>
      </main>
    )
  }

  const consumed = state === 'consumed'

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="mb-4 rounded-2xl shadow-md" />
        </div>

        <div className={`rounded-2xl border p-6 ${consumed ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${consumed ? 'bg-amber-100' : 'bg-red-100'}`}>
            {consumed
              ? <MailWarning className="h-8 w-8 text-amber-500" />
              : <AlertTriangle className="h-8 w-8 text-red-500" />}
          </div>

          <h1 className={`text-xl font-bold ${consumed ? 'text-amber-900' : 'text-red-900'}`}>
            {consumed ? 'This link was already opened' : 'Verification failed'}
          </h1>

          <p className={`mt-3 text-sm leading-relaxed ${consumed ? 'text-amber-800' : 'text-red-700'}`}>
            {consumed
              ? 'Verification links can only be used once, and some email apps open links automatically to preview them. That can use up the link before you tap it.'
              : 'We could not complete your activation from this link.'}
          </p>

          {canResend ? (
            <>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : cooldown > 0
                    ? `Resend available in ${cooldown}s`
                    : <><RefreshCw className="h-4 w-4" /> Send me a new link</>}
              </button>
              {resendMsg && (
                <p className="mt-3 text-xs font-medium text-slate-600" role="status">{resendMsg}</p>
              )}
            </>
          ) : (
            <p className={`mt-4 text-sm ${consumed ? 'text-amber-700' : 'text-red-600'}`}>
              Open your activation link again on this device, or ask your gym to
              re-send the invitation.
            </p>
          )}

          <Link
            href="/auth/login"
            className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 underline hover:text-slate-700"
          >
            Already activated? Go to login
          </Link>

          {/* Surfaced so a member can quote the exact reason to their gym. */}
          {detail && (
            <p className="mt-3 font-mono text-[10px] text-slate-400">ref: {detail}</p>
          )}
        </div>
      </div>
    </main>
  )
}
