'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import QRCode from 'qrcode'
import { createPortal } from 'react-dom'
import {
  Clock, CheckCircle, XCircle, Upload, Copy,
  RefreshCw, MessageCircle, AlertCircle, ArrowRight, Shield,
  Calendar, Zap, Check, Circle, CheckCircle2, ArrowLeft, Lock, QrCode, X
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { computeSubscriptionState, PLAN_MEMBER_LIMIT } from '@/lib/subscription-utils'
import { api, GymFlowAPIError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { useRealtimeChannel } from '@/lib/hooks/useRealtimeChannel'
import { useRealtimeInvalidation } from '@/lib/hooks/useRealtimeInvalidation'

interface GymInfo {
  id: string
  name: string
  subscriptionStatus: string
  trialEndsAt: string | null
  subscriptionEndsAt: string | null
  isFree: boolean
  isTrial: boolean
  trialEnded: boolean
  whatsappAddonUntil: string | null
}

interface SubState {
  status: string
  daysLeft: number | null
  isExpired: boolean
  isExpiringSoon?: boolean
}

interface LatestRequest {
  id: string
  status: string
  submitted_at: string
  rejection_reason?: string | null
}

interface Settings {
  upi_id: string
  upi_name: string
}

/** Prices from platform_settings; null when they could not be read (prices are then hidden). */
interface Prices {
  monthly: number
  yearly: number
  whatsappAddon: number
}

/** "Price unavailable" rather than a guessed number when the server could not read the price. */
function formatInr(price: number | null): string {
  return price === null ? 'Price unavailable' : `₹${price.toLocaleString('en-IN')}`
}

/** The two SaaS billing tiers a gym owner can buy. */
type PlanId = 'monthly' | 'yearly' | 'whatsapp_addon'

interface Props {
  gym: GymInfo
  subState: SubState
  latestRequest: LatestRequest | null
  settings: Settings
  prices: Prices | null
}

export default function SubscriptionClient({ gym, subState, latestRequest, settings, prices }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('monthly')
  const [freeBusy, setFreeBusy] = useState(false)
  const [freeError, setFreeError] = useState('')

  /*
    The two tiers, in one place. Price is read from here by both the plan grid and
    the payment step, and the QR below is generated from this same `price`, so the
    amount shown and the amount encoded in the QR can never drift apart.

    No static QR image per tier any more. The old flow shipped one JPEG per price
    (2999.jpeg, 29k.jpeg) with the amount baked into the UPI payload, which meant a
    reused or mismatched image could display one price and charge another. The QR is
    now built at runtime from the UPI id + this amount, so a price change in the DB
    is reflected in the QR automatically with no image to regenerate.
  */
  const PLANS: {
    id: PlanId
    name: string
    price: number | null
    period: string
    badge?: string
    Icon: typeof Calendar
  }[] = [
    { id: 'monthly',     name: 'Monthly Plan',  price: prices?.monthly ?? null,     period: '/ month',    Icon: Calendar },
    { id: 'yearly',      name: 'Yearly Plan',   price: prices?.yearly ?? null,      period: '/ year',     Icon: Zap,      badge: 'BEST VALUE' },
  ]

  // The add-on is not a tile in PLANS (those are the base tiers); its price comes from
  // platform_settings like the base tiers, and the admin picks 'whatsapp_addon' at approval from the "Intended Plan" note.
  const activePlan: { id: PlanId; name: string; price: number | null } = selectedPlan === 'whatsapp_addon'
    ? { id: 'whatsapp_addon' as const, name: 'WhatsApp Add-on', price: prices?.whatsappAddon ?? null }
    : PLANS.find(p => p.id === selectedPlan) ?? PLANS[0]

  // Comes only from platform_settings.upi_id. There is deliberately no hard-coded fallback:
  // a forked deployment that has not set it must show "not set up" rather than send an
  // owner's payment to someone else's account.
  const upiId = settings.upi_id
  const upiName = settings.upi_name || 'GymFlow'

  /*
    The UPI intent string, per the NPCI deep-link spec. `am` is the selected plan's
    exact amount and `cu` fixes the currency, so scanning pre-fills the payee, name
    and amount in any UPI app. tr is a reference so the owner can match the payment
    later. Rebuilt whenever the amount or UPI details change.
  */
  const upiString = useMemo(() => {
    // No QR without a known price: an unreadable price must never become a payment amount.
    if (!upiId || activePlan.price === null) return ''
    const params = new URLSearchParams({
      pa: upiId,
      pn: upiName,
      am: String(activePlan.price),
      cu: 'INR',
      tn: `GymFlow ${activePlan.name}`,
    })
    return `upi://pay?${params.toString()}`
  }, [upiId, upiName, activePlan.price, activePlan.name])

  // Rendered QR as a data URL. Generated client-side from upiString; regenerates when
  // the selected plan (and thus the amount) changes. Empty until the first render.
  const [qrDataUrl, setQrDataUrl] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!upiString) {
      setQrDataUrl('')
      return
    }
    QRCode.toDataURL(upiString, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl('') })
    return () => { cancelled = true }
  }, [upiString])
  const [file, setFile] = useState<File | null>(null)
  const [transactionId, setTransactionId] = useState('')
  const [notes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Payment-window countdown shown on the QR card. It is a pacing aid only: the UPI QR itself
  // never stops working, so on expiry the QR is covered until the owner taps Refresh, which
  // restarts the window. Runs only on the payment step, and restarts when the amount changes.
  const PAY_WINDOW_SECS = 10 * 60
  const [secondsLeft, setSecondsLeft] = useState(PAY_WINDOW_SECS)
  const [timerRun, setTimerRun] = useState(0)
  // The QR opens as a modal over the blurred page when the payment step starts; closing it
  // reveals the upload form underneath, and a button on the page reopens it.
  const [qrOpen, setQrOpen] = useState(true)
  const [modalStep, setModalStep] = useState<'pay' | 'upload' | 'done'>('pay')
  // True from a successful submit until the owner closes the card, so the Done step is not
  // replaced by the full-page pending screen the realtime/refresh update would otherwise show.
  const [doneOpen, setDoneOpen] = useState(false)
  useEffect(() => {
    if (step !== 2) return
    setQrOpen(true)
    setModalStep('pay')
    setSecondsLeft(PAY_WINDOW_SECS)
    const id = setInterval(() => setSecondsLeft(n => (n > 0 ? n - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [step, timerRun, upiString, PAY_WINDOW_SECS])
  useEffect(() => {
    if (!qrOpen || step !== 2) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && modalStep === 'pay') setQrOpen(false) }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [qrOpen, step, modalStep])

  const [liveRequest, setLiveRequest] = useState(latestRequest)
  const [liveSubState, setLiveSubState] = useState(subState)
  const previousSubStateRef = useRef(subState)
  const redirectScheduledRef = useRef(false)

  useEffect(() => {
    setLiveRequest(latestRequest)
    setLiveSubState(subState)
    previousSubStateRef.current = subState
  }, [latestRequest, subState])

  const syncSubscription = useCallback(async () => {
    const res = await fetch('/api/subscription/sync')
    const json = await res.json()
    if (!res.ok || !json.data) return

    const { latestRequest: reqData, gym: gymData } = json.data

    if (reqData !== undefined) setLiveRequest(reqData)
    if (gymData) {
      const nextState = computeSubscriptionState(gymData)
      const previousState = previousSubStateRef.current
      previousSubStateRef.current = nextState
      setLiveSubState(nextState)

      const isAccessible = !nextState.isExpired
        && !nextState.isExpiringSoon
        && (nextState.status === 'active' || nextState.status === 'trial')
      const accessWasBlocked = previousState.isExpired
        || previousState.isExpiringSoon
        || (previousState.status !== 'active' && previousState.status !== 'trial')

      if (isAccessible && accessWasBlocked && !redirectScheduledRef.current) {
        redirectScheduledRef.current = true
        toast.success(
          nextState.status === 'active'
            ? 'Your subscription has been activated! Redirecting...'
            : 'Your trial has been extended! Redirecting...',
        )
        window.setTimeout(() => { window.location.href = '/owner/dashboard' }, 1_500)
      }
    }
  }, [gym.id])

  useRealtimeChannel({
    channelName: `owner_subscription_${gym.id}`,
    subscriptions: [
      {
        type: 'postgres_changes',
        filter: {
          event: 'INSERT',
          schema: 'public',
          table: 'subscription_requests',
          filter: `gym_id=eq.${gym.id}`,
        },
        callback: syncSubscription,
      },
      {
        type: 'postgres_changes',
        filter: {
          event: 'UPDATE',
          schema: 'public',
          table: 'subscription_requests',
          filter: `gym_id=eq.${gym.id}`,
        },
        callback: async (payload) => {
          await syncSubscription()
          if (payload.eventType !== 'UPDATE') return
          if (payload.new?.status === 'rejected') {
            toast.error('Your payment request was rejected.')
            setSuccess(false)
          } else if (payload.new?.status === 'approved') {
            setSuccess(true)
            // The access-change redirect in syncSubscription never fires for a Free gym buying the
            // WhatsApp add-on (still Free before and after), so approval itself sends them back.
            if (!redirectScheduledRef.current) {
              redirectScheduledRef.current = true
              toast.success('Payment approved! Redirecting to your dashboard...')
              window.setTimeout(() => { window.location.href = '/owner/dashboard' }, 1_500)
            }
          }
        },
      },
      {
        type: 'postgres_changes',
        filter: { event: 'UPDATE', schema: 'public', table: 'gyms', filter: `id=eq.${gym.id}` },
        callback: syncSubscription,
      },
    ],
    onResync: syncSubscription,
  })

  useRealtimeInvalidation({
    channelName: `gym:${gym.id}:subscription`,
    privateChannel: true,
    onInvalidate: syncSubscription,
  })

  const isPending  = liveRequest?.status === 'pending'
  const isRejected = liveRequest?.status === 'rejected'

  function copyUpi() {
    if (!settings.upi_id) return
    navigator.clipboard.writeText(settings.upi_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function continueOnFree() {
    setFreeBusy(true)
    setFreeError('')
    try {
      await api.post('/api/subscription/free')
      router.refresh()
    } catch (err) {
      setFreeError(err instanceof GymFlowAPIError ? err.message : 'Could not switch to the free forever plan. Please try again.')
    } finally {
      setFreeBusy(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Please attach your payment screenshot or PDF.'); return }

    setSubmitting(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('transaction_id', transactionId)
    // Structured plan for the server to validate; the notes line below is kept for the admin.
    fd.append('plan', selectedPlan)
    
    // Automatically include the selected plan in the notes for the admin
    const finalNotes = `Intended Plan: ${selectedPlan.toUpperCase()}\n${notes}`
    fd.append('notes', finalNotes.trim())

    // Raw fetch (multipart upload), so send the CSRF header lib/api/client.ts would add.
    // No Content-Type: the browser sets the multipart boundary itself.
    const res = await fetch('/api/subscription/request', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setDoneOpen(true)
    setModalStep('done')
    // router.refresh() runs when the owner closes the Done step (closeModal), so the pending
    // screen does not replace the card while it is still showing the confirmation.
  }

  const planFeatures = [
    'Full access to all features',
    'Member management',
    'Attendance & reports',
    'WhatsApp automation',
    'Priority support'
  ]

  const globalFeatures = [
    'Unlimited members',
    'All reports & analytics',
    'Regular feature updates'
  ]

  // If subscription is active (not expiring soon), show simple active state
  if (!gym.isFree && liveSubState.status === 'active' && !liveSubState.isExpired && !liveSubState.isExpiringSoon) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-surface rounded-2xl border border-emerald-200 p-10 text-center space-y-4 shadow-sm max-w-md w-full">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Your subscription is active</h2>
          <p className="text-sm text-slate-500">You have full access to all GymFlow features.</p>
          <Link href="/owner/dashboard" className="inline-flex items-center justify-center w-full py-3 bg-brand-500 text-white rounded-xl font-bold hover:bg-brand-700 transition-colors">
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // If payment is under review, show pending state
  if (isPending && !success && !doneOpen) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-surface rounded-2xl border border-amber-200 p-8 shadow-sm max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Payment Under Review</h2>
            <p className="text-sm text-slate-500 mt-2">
              Submitted on {liveRequest?.submitted_at ? new Date(liveRequest.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}
            </p>
          </div>
          <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
            Our team is verifying your payment. This usually takes <span className="font-semibold">a few hours</span>. We'll activate your account as soon as it's confirmed.
          </p>
          <a
            href={`https://wa.me/91${settings.upi_name.replace(/\D/g, '')}?text=${encodeURIComponent('Hello GymFlow Support. I have submitted a payment proof and am waiting for verification. Please confirm status.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl font-bold hover:bg-emerald-100 transition-colors"
          >
            <MessageCircle className="w-5 h-5" /> Contact Support on WhatsApp
          </a>
        </div>
      </div>
    )
  }

  // Success state immediately after submitting form
  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-surface rounded-3xl border border-emerald-200 p-10 text-center shadow-sm max-w-md w-full space-y-5">
          <CheckCircle className="w-20 h-20 text-emerald-500 mx-auto" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Payment Proof Submitted!</h2>
            <p className="text-sm text-slate-500 mt-2">Our team will verify and activate your account shortly.</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-center gap-2 text-sm text-slate-600 font-medium border border-slate-100">
            <Shield className="w-4 h-4 text-emerald-500" />
            Usually activated within a few hours
          </div>
        </div>
      </div>
    )
  }

  // Display-only derivations for the checkout summary; nothing here feeds a handler.
  const isAddon = selectedPlan === 'whatsapp_addon'
  const periodLabel = selectedPlan === 'yearly' ? 'Billed yearly' : 'Billed monthly'
  // Computed from the two real prices only, so the hint can never drift from the DB.
  const yearlySavePct = prices && prices.monthly > 0 && prices.yearly < prices.monthly * 12
    ? Math.round((1 - prices.yearly / (prices.monthly * 12)) * 100)
    : 0
  const checklist = [...planFeatures, ...globalFeatures]

  const stepper = (
    <ol className="flex items-center gap-3 mb-6" aria-label="Checkout steps">
      {[{ n: 1, label: 'Plan' }, { n: 2, label: 'Payment' }].map((s, i) => {
        const done = step > s.n
        const current = step === s.n
        return (
          <li key={s.n} className="flex items-center gap-3" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className={cn('h-px w-8 sm:w-12', step >= s.n ? 'bg-brand-500' : 'bg-slate-200')} />}
            <span className="flex items-center gap-2">
              <span className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                done || current ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500',
              )}>
                {done ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.n}
              </span>
              <span className={cn('text-sm font-semibold', current ? 'text-slate-900' : 'text-slate-500')}>{s.label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )

  // Same card for both steps. On a phone it sits above the form in step 2 (so the amount is
  // seen first) and below the plan list in step 1 (so Continue is the next thing reached).
  const summary = (
    <aside
      aria-label="Order summary"
      className={cn(
        'bg-surface border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 lg:sticky lg:top-6',
        step === 2 && 'order-first lg:order-none',
      )}
    >
      <h3 className="text-base font-bold text-slate-900">Order summary</h3>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{activePlan.name}</p>
          <p className="text-xs text-slate-500">{isAddon ? 'Billed monthly, add-on' : periodLabel}</p>
        </div>
        <p className="text-sm font-semibold text-slate-700 text-right">{formatInr(activePlan.price)}</p>
      </div>

      <div className="border-t border-slate-200 pt-4 flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-slate-900">Total</span>
        <span className="text-2xl font-black text-slate-900 tracking-tight">{formatInr(activePlan.price)}</span>
      </div>

      {/* The base-plan feature list does not describe the add-on, so it is hidden for it. */}
      {!isAddon && (
        <div className={cn('border-t border-slate-200 pt-4', step === 2 && 'hidden lg:block')}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">What you get</p>
          <ul className="space-y-2">
            {checklist.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 stroke-[3]" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 1 ? (
        <button
          onClick={() => setStep(2)}
          disabled={activePlan.price === null}
          className="w-full min-h-[48px] px-6 py-3 bg-brand-500 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-md shadow-brand-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Payment <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Shield className="w-4 h-4 text-slate-400 flex-shrink-0" />
          Pay securely using any UPI app
        </p>
      )}
    </aside>
  )

  // Step-by-step payment card, portalled to <body> so AppShell cannot clip it; the page behind
  // is blurred by the backdrop. Pay (QR + timer) -> Upload (proof) -> Done (support link).
  const MODAL_STEPS: { id: 'pay' | 'upload' | 'done'; label: string }[] = [
    { id: 'pay', label: 'Pay' },
    { id: 'upload', label: 'Upload' },
    { id: 'done', label: 'Done' },
  ]
  const modalIdx = MODAL_STEPS.findIndex(s => s.id === modalStep)
  const supportHref = 'https://wa.me/919384886895?text=Hello GymFlow Support. I am having issues with my subscription payment.'
  const closeModal = () => {
    if (modalStep === 'done') {
      // The pending-request screen takes over once the server state is refreshed.
      setDoneOpen(false)
      setQrOpen(false)
      router.refresh()
      return
    }
    setQrOpen(false)
  }
  const qrModal = qrOpen && step === 2 && typeof document !== 'undefined' ? createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-ink-950/50 backdrop-blur-md"
      onClick={modalStep === 'upload' ? undefined : closeModal}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Complete your payment"
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[94vh] overflow-y-auto rounded-3xl bg-surface border border-slate-200 shadow-2xl p-6 sm:p-10 flex flex-col items-center gap-5"
      >
        {modalStep !== 'done' && (
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <ol className="flex items-center gap-2 self-start" aria-label="Payment steps">
          {MODAL_STEPS.map((s, i) => {
            const reached = i <= modalIdx
            return (
              <li key={s.id} className="flex items-center gap-2" aria-current={i === modalIdx ? 'step' : undefined}>
                {i > 0 && <span className={cn('h-px w-8', reached ? 'bg-brand-500' : 'bg-slate-200')} />}
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  reached ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500',
                )}>
                  {i < modalIdx ? <Check className="w-3 h-3 stroke-[3]" /> : i + 1}
                </span>
                <span className={cn('text-sm font-semibold', i === modalIdx ? 'text-slate-900' : 'text-slate-500')}>{s.label}</span>
              </li>
            )
          })}
        </ol>

        {modalStep === 'pay' && (
          <>
            <div className="text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{activePlan.name}</p>
              <p className="text-4xl font-black text-slate-900 tracking-tight mt-1">{formatInr(activePlan.price)}</p>
              <p className="text-base text-slate-500 font-medium mt-1">Scan with any UPI app to pay</p>
            </div>

            <div className="w-64 h-64 sm:w-72 sm:h-72 p-3 bg-white border border-slate-100 rounded-2xl flex items-center justify-center relative overflow-hidden">
              {qrDataUrl ? (
                /* Data URL from the runtime QR, so a plain img (next/image does not optimise inline data).
                   Kept on a white tile in both themes: a QR must stay dark-on-light to scan.
                   eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={qrDataUrl}
                  alt={`UPI QR code for the ${activePlan.name} — ${formatInr(activePlan.price)}`}
                  className={cn('w-full h-full object-contain transition-opacity', secondsLeft === 0 && 'opacity-10 blur-sm')}
                />
              ) : (
                <span className="px-3 text-center text-[11px] font-medium text-slate-400">
                  {upiId ? 'Generating QR…' : 'Payment details are not set up yet'}
                </span>
              )}
              {qrDataUrl && secondsLeft === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 px-4 text-center">
                  <p className="text-sm font-bold text-slate-900">Payment window ended</p>
                  <button
                    type="button"
                    onClick={() => setTimerRun(n => n + 1)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg bg-brand-500 hover:bg-brand-700 text-white text-sm font-bold transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> Refresh QR
                  </button>
                </div>
              )}
            </div>

            {qrDataUrl && (
              <div className="w-full" role="timer" aria-live="off">
                <div className="flex items-center justify-center gap-1.5 text-sm font-bold tabular-nums">
                  <Clock className={cn('w-4 h-4', secondsLeft <= 60 ? 'text-red-500' : 'text-brand-600')} />
                  <span className={secondsLeft <= 60 ? 'text-red-600' : 'text-slate-900'}>
                    {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">left to pay</span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-1000 ease-linear', secondsLeft <= 60 ? 'bg-red-500' : 'bg-brand-500')}
                    style={{ width: `${(secondsLeft / PAY_WINDOW_SECS) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="w-full flex items-center justify-between gap-2 rounded-xl bg-surface-secondary px-4 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">UPI ID</p>
                <p className="text-sm font-bold text-slate-900 truncate">{settings.upi_id || 'Not set up'}</p>
              </div>
              <button onClick={copyUpi} className="w-11 h-11 flex items-center justify-center flex-shrink-0 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors" title="Copy UPI ID">
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setModalStep('upload')}
              className="w-full min-h-[52px] rounded-xl bg-brand-500 hover:bg-brand-700 text-white font-bold transition-colors flex items-center justify-center gap-2"
            >
              I have paid, upload screenshot <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {modalStep === 'upload' && (
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Upload payment proof</h3>
              <p className="text-sm text-slate-500 font-medium mt-1">
                A screenshot of your {formatInr(activePlan.price)} payment helps us activate you faster.
              </p>
            </div>

            <div>
              <input
                type="file"
                ref={fileRef}
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <div
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'cursor-pointer border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-colors',
                  file ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100',
                )}
              >
                {file ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-brand-500" />
                    <span className="text-sm font-bold text-brand-700 break-all text-center">{file.name}</span>
                    <span className="text-xs text-brand-600/70 font-medium">Click to change file</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-400 mb-1" />
                    <span className="text-sm font-bold text-slate-700">Click to upload proof</span>
                    <span className="text-xs text-slate-500 font-medium">JPG, PNG or PDF • Max 10 MB</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="txnId" className="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">
                Transaction ID / UTR (Optional)
              </label>
              <input
                id="txnId"
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. 403612345678"
                className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium placeholder:font-normal"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-semibold border border-red-100">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !file}
              className={cn(
                'w-full min-h-[48px] rounded-xl font-bold transition-all flex items-center justify-center gap-2',
                submitting || !file
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-700 text-white shadow-md shadow-brand-500/25',
              )}
            >
              {submitting ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
              ) : (
                <>Submit Proof <ArrowRight className="w-4 h-4" /></>
              )}
            </button>

            <button
              type="button"
              onClick={() => setModalStep('pay')}
              disabled={submitting}
              className="w-full min-h-[44px] text-sm font-bold text-brand-600 hover:underline disabled:opacity-50"
            >
              Back to QR code
            </button>
          </form>
        )}

        {modalStep === 'done' && (
          <div className="w-full flex flex-col items-center gap-4 text-center">
            <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900">Payment proof submitted</h3>
              <p className="text-base text-slate-500 font-medium mt-2">
                Our team will verify your payment and activate your account. This usually takes a few hours.
              </p>
            </div>
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[52px] rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-bold transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" /> Contact support
            </a>
            <button
              type="button"
              onClick={closeModal}
              className="w-full min-h-[52px] rounded-xl bg-brand-500 hover:bg-brand-700 text-white font-bold transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div className="min-h-screen bg-surface-secondary flex flex-col items-center px-4 sm:px-8 xl:px-14 py-6 md:py-10">
      {qrModal}
      <div className="w-full max-w-[1400px] space-y-6">

        {/* Slim top row. Back-to-dashboard is hidden when the gym is blocked (expired / trial
            over): the paywall would send them straight back here, so the link would only loop. */}
        <div className="flex items-center justify-between gap-3 min-h-[44px]">
          {step === 1 && !liveSubState.isExpired && !gym.trialEnded ? (
            <Link
              href="/owner/dashboard"
              className="inline-flex items-center gap-2 min-h-[44px] text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to dashboard
            </Link>
          ) : <span />}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Lock className="w-3.5 h-3.5" />
            Secure checkout
          </span>
        </div>

        {/* Banner Section */}
        {liveSubState.isExpired ? (
          <div className="bg-red-50/80 border border-red-100 rounded-3xl p-6 md:p-8 flex items-center justify-between relative overflow-hidden shadow-sm">
             <div className="relative z-10 space-y-3">
               <div className="flex items-center gap-3">
                 <AlertCircle className="w-6 h-6 text-red-500" />
                 <h2 className="text-xl md:text-2xl font-bold text-slate-900">
                   {liveSubState.status === 'trial' || gym.subscriptionStatus === 'trial'
                     ? 'Your Trial Has Expired'
                     : 'Your Subscription Has Expired'}
                 </h2>
                 <span className="px-3 py-1 bg-red-200/50 text-red-700 text-[11px] font-black uppercase tracking-wider rounded-full">Expired</span>
               </div>
               <p className="text-sm font-bold text-slate-700">
                 {gym.subscriptionStatus === 'trial'
                   ? `Your 14-day free trial ended on ${gym.trialEndsAt ? new Date(gym.trialEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}.`
                   : `Your subscription ended on ${gym.subscriptionEndsAt ? new Date(gym.subscriptionEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}.`}
               </p>
               <p className="text-sm text-slate-500 font-medium">
                 Choose a plan and continue using GymFlow without any interruption.
               </p>
             </div>
             <div className="hidden md:flex absolute -right-6 -bottom-8 opacity-20 transform rotate-[-10deg]">
               <Calendar className="w-48 h-48 text-red-500" />
               <Clock className="w-20 h-20 text-red-600 absolute bottom-10 -left-6 bg-red-50 rounded-full" />
             </div>
          </div>
        ) : (liveSubState.status === 'expiring' || liveSubState.isExpiringSoon) ? (
          <div className="bg-amber-50/80 border border-amber-200 rounded-3xl p-6 md:p-8 flex items-center justify-between relative overflow-hidden shadow-sm">
             <div className="relative z-10 space-y-3">
               <div className="flex items-center gap-3">
                 <AlertCircle className="w-6 h-6 text-amber-500" />
                 <h2 className="text-xl md:text-2xl font-bold text-slate-900">Your Subscription is Expiring Soon</h2>
                 <span className="px-3 py-1 bg-amber-200/50 text-amber-700 text-[11px] font-black uppercase tracking-wider rounded-full">Expiring</span>
               </div>
               <p className="text-sm font-bold text-slate-700">
                 {liveSubState.daysLeft != null && liveSubState.daysLeft <= 1
                   ? 'Your subscription expires today!'
                   : `Your subscription expires in ${liveSubState.daysLeft} day${liveSubState.daysLeft !== 1 ? 's' : ''}.`}
               </p>
               <p className="text-sm text-slate-500 font-medium">
                 Renew now to keep uninterrupted access to all GymFlow features.
               </p>
             </div>
             <div className="hidden md:flex absolute -right-6 -bottom-8 opacity-20 transform rotate-[-10deg]">
               <Clock className="w-48 h-48 text-amber-500" />
             </div>
          </div>
        ) : liveSubState.status === 'trial' ? (
          <div className="bg-brand-50/80 border border-brand-100 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
             <Clock className="w-5 h-5 text-brand-500 flex-shrink-0" />
             <h2 className="text-sm font-bold text-slate-900">Your Free Trial</h2>
             <span className="px-2.5 py-0.5 bg-brand-200/50 text-brand-700 text-[11px] font-black uppercase tracking-wider rounded-full">Active</span>
             <p className="text-sm font-semibold text-slate-700">
               You have {liveSubState.daysLeft} day{liveSubState.daysLeft !== 1 ? 's' : ''} left in your trial.
             </p>
             <p className="w-full text-xs text-slate-500">
               Choose a plan early to continue using GymFlow without any interruption.
             </p>
          </div>
        ) : null}

        {/* Previous rejection warning */}
        {isRejected && step === 1 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
            <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-bold text-red-900">Your previous payment was rejected</p>
              {liveRequest?.rejection_reason && (
                <p className="text-sm text-red-700 mt-1 font-medium bg-red-100/50 p-2 rounded-lg inline-block">{liveRequest.rejection_reason}</p>
              )}
              <p className="text-sm text-red-600 mt-2">Please select a plan and submit a new payment proof.</p>
            </div>
          </div>
        )}

        {/* Trial over: the owner can keep a limited Free plan instead of paying. */}
        {step === 1 && gym.trialEnded && (
          <div className="bg-surface-card border border-surface-border rounded-2xl p-5 space-y-3">
            <h3 className="text-lg font-bold text-slate-900">Continue on the free forever plan (up to {PLAN_MEMBER_LIMIT} members)</h3>
            <p className="text-sm text-slate-500">Keep using GymFlow for free with up to {PLAN_MEMBER_LIMIT} members, or choose a paid plan below for everyone.</p>
            {freeError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-semibold border border-red-100">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {freeError}
              </div>
            )}
            <button
              onClick={continueOnFree}
              disabled={freeBusy}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold border border-surface-border bg-surface text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {freeBusy ? <><RefreshCw className="w-4 h-4 animate-spin" /> Switching...</> : 'Continue on the free forever plan'}
            </button>
          </div>
        )}

        {/* Checkout: working area (fluid) + sticky order summary (fixed 420px) on desktop, one column on phones. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-8 items-start">
          <div className="bg-surface rounded-2xl border border-slate-200 p-5 sm:p-8 min-w-0">
            {stepper}

            {/* Step 1 UI */}
            {step === 1 && (
              <div>
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-slate-900">Choose Your Plan</h3>
                  <p className="text-sm text-slate-500 font-medium">Select the plan that works best for your gym.</p>
                </div>

                <div className="space-y-3" role="radiogroup" aria-label="Subscription plan">
                  {PLANS.map(plan => {
                    const isSelected = selectedPlan === plan.id
                    return (
                      <div
                        key={plan.id}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onClick={() => setSelectedPlan(plan.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPlan(plan.id) } }}
                        className={cn(
                          'cursor-pointer rounded-xl border-2 p-4 sm:p-5 min-h-[72px] flex items-center gap-4 transition-colors',
                          isSelected ? 'border-brand-500 bg-brand-50/40' : 'border-slate-200 bg-surface hover:border-brand-200',
                        )}
                      >
                        {isSelected
                          ? <CheckCircle2 className="w-6 h-6 text-brand-600 flex-shrink-0" />
                          : <Circle className="w-6 h-6 text-slate-300 flex-shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className={cn('text-base font-bold', isSelected ? 'text-brand-700' : 'text-slate-800')}>{plan.name}</p>
                            {plan.badge && (
                              <span className="bg-brand-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full tracking-wider">
                                {plan.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {plan.id === 'yearly' ? 'Billed once a year' : 'Billed every month'}
                            {plan.id === 'yearly' && yearlySavePct > 0 && (
                              <span className="font-semibold text-emerald-600">{` · Save ${yearlySavePct}%`}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">{formatInr(plan.price)}</p>
                          <p className="text-xs font-semibold text-slate-400">{plan.period}</p>
                        </div>
                      </div>
                    )
                  })}

                  {/* WhatsApp add-on, Free and trial gyms: a small extra option that rides the same
                      payment step and request route. Kept compact so it reads as an extra, not a plan.
                      On a trial, approval ends the trial and moves the gym to the free forever plan. */}
                  {(gym.isFree || gym.isTrial) && (
                    <div
                      id="whatsapp-addon"
                      role="radio"
                      aria-checked={selectedPlan === 'whatsapp_addon'}
                      tabIndex={0}
                      onClick={() => setSelectedPlan('whatsapp_addon')}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPlan('whatsapp_addon') } }}
                      className={cn(
                        'relative cursor-pointer rounded-xl border-2 p-4 sm:p-5 min-h-[72px] flex items-center gap-4 transition-colors',
                        selectedPlan === 'whatsapp_addon' ? 'border-emerald-500 bg-emerald-50/40' : 'border-emerald-300 bg-surface hover:border-emerald-500',
                      )}
                    >
                      {selectedPlan === 'whatsapp_addon'
                        ? <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                        : <Circle className="w-6 h-6 text-slate-300 flex-shrink-0" />}
                      <MessageCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800">
                          WhatsApp automation add-on{prices ? `, ${formatInr(prices.whatsappAddon)}/month` : ''}
                          <span className="ml-2 align-middle rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            Add-on
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {gym.whatsappAddonUntil && new Date(gym.whatsappAddonUntil).getTime() > Date.now()
                            ? `Active until ${new Date(gym.whatsappAddonUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Pay again to extend.`
                            : gym.isTrial
                              ? 'Your trial becomes the free forever plan (up to 50 members) with WhatsApp messages for your members.'
                              : 'WhatsApp messages for your members while you stay on the free forever plan.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Fills the working column on desktop and answers the three questions owners ask
                    before paying: how, when it starts, and whether it is safe. */}
                <ul className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-200 pt-6">
                  {[
                    { title: 'Pay with any UPI app', body: 'GPay, PhonePe, Paytm or your bank app.' },
                    { title: 'Activated after verification', body: 'We confirm your payment and switch your plan on.' },
                    { title: 'No card details needed', body: 'You pay by UPI and upload a screenshot as proof.' },
                  ].map(t => (
                    <li key={t.title} className="flex items-start gap-3 rounded-xl bg-surface-secondary p-4">
                      <Shield className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-slate-900">{t.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Step 2 UI */}
            {step === 2 && (
              <div className="flex flex-col">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Make Payment</h3>
                    <p className="text-sm text-slate-500 font-medium">Pay securely using any UPI app</p>
                  </div>
                  <button onClick={() => { setStep(1); if (selectedPlan === 'whatsapp_addon') setSelectedPlan('monthly') }} className="min-h-[44px] text-brand-600 text-sm font-bold hover:underline px-3 rounded-lg hover:bg-brand-50 transition-colors">
                    ← Back to Plans
                  </button>
                </div>

                {/* Payment details block (QR + Instructions), stacked: the working column is too narrow for side by side. */}
                <div className="flex flex-col gap-4 mb-6">

                  {/* Payment details. The QR itself is in the modal (opens on entering this step). */}
                  <div className="border border-slate-200 p-5 rounded-2xl bg-surface flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="min-w-0 flex-1 space-y-4">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">UPI ID</p>
                        <div className="flex items-center gap-1">
                          <p className="text-lg font-black text-slate-900 break-all">{settings.upi_id || 'Not set up'}</p>
                          <button onClick={copyUpi} className="w-11 h-11 flex items-center justify-center flex-shrink-0 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors" title="Copy UPI ID">
                            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-10 gap-y-4">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pay to</p>
                          <p className="text-sm font-bold text-slate-700">{settings.upi_name}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Amount</p>
                          <p className="text-brand-600 font-black text-lg">
                            {formatInr(activePlan.price)}
                            <span className="text-sm font-semibold ml-1">({activePlan.name})</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setModalStep('pay'); setQrOpen(true) }}
                      className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl border-2 border-brand-500 text-brand-600 hover:bg-brand-50 font-bold text-sm transition-colors"
                    >
                      <QrCode className="w-5 h-5" /> Show QR code
                    </button>
                  </div>

                  {/* Instructions */}
                  {/* bg-brand-50 rather than the arbitrary #F5F8FF it was: an arbitrary value
                     cannot be themed, so this panel would have stayed pale blue in dark mode. */}
                  <div className="bg-brand-50 rounded-2xl p-5 border border-brand-100/50">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertCircle className="w-5 h-5 text-brand-600" />
                      <h4 className="text-base font-bold text-slate-900">Payment Instructions</h4>
                    </div>

                    <ul className="space-y-3">
                      {[
                        'Scan the QR code or use the UPI ID',
                        'Complete the payment',
                        'Take a screenshot of the payment',
                        'Upload the screenshot below'
                      ].map((text, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center flex-shrink-0 text-xs font-black">{i + 1}</div>
                          <span className="text-sm font-semibold text-slate-700">{text}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500">
                      <Shield className="w-4 h-4 text-slate-400" />
                      Your payment is secure with UPI
                    </div>
                  </div>

                </div>

                {/* The upload form lives in the payment card (Upload step); this reopens it there. */}
                <div className="border-t border-slate-200 pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <a
                    href="https://wa.me/919384886895?text=Hello GymFlow Support. I am having issues with my subscription payment."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 min-h-[44px] text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline transition-all"
                  >
                    <MessageCircle className="w-4 h-4" /> Having any issues? Contact us
                  </a>
                  <button
                    type="button"
                    onClick={() => { setModalStep('upload'); setQrOpen(true) }}
                    className="w-full sm:w-auto min-h-[48px] px-8 py-3 rounded-xl font-bold bg-brand-500 hover:bg-brand-700 text-white shadow-md shadow-brand-500/25 flex items-center justify-center gap-2 transition-all"
                  >
                    <Upload className="w-4 h-4" /> Upload payment proof
                  </button>
                </div>
              </div>
            )}
          </div>

          {summary}
        </div>
      </div>
    </div>
  )
}
