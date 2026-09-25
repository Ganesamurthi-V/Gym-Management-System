'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import QRCode from 'qrcode'
import {
  Clock, CheckCircle, XCircle, Upload, Copy, CreditCard,
  RefreshCw, MessageCircle, AlertCircle, ArrowRight, Shield,
  Calendar, CalendarClock, Zap, Check, Circle, CheckCircle2
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { computeSubscriptionState } from '@/lib/subscription-utils'
import { useRealtimeChannel } from '@/lib/hooks/useRealtimeChannel'
import { useRealtimeInvalidation } from '@/lib/hooks/useRealtimeInvalidation'

interface GymInfo {
  id: string
  name: string
  subscriptionStatus: string
  trialEndsAt: string | null
  subscriptionEndsAt: string | null
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
  price_monthly: number
  price_half_yearly: number
  price_yearly: number
}

/** The three SaaS billing tiers a gym owner can buy. */
type PlanId = 'monthly' | 'half_yearly' | 'yearly'

interface Props {
  gym: GymInfo
  subState: SubState
  latestRequest: LatestRequest | null
  settings: Settings
}

export default function SubscriptionClient({ gym, subState, latestRequest, settings }: Props) {
  const [step, setStep] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('monthly')

  /*
    The three tiers, in one place. Price is read from here by both the plan grid and
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
    price: number
    period: string
    badge?: string
    Icon: typeof Calendar
  }[] = [
    { id: 'monthly',     name: 'Monthly Plan',  price: settings.price_monthly,     period: '/ month',    Icon: Calendar },
    { id: 'half_yearly', name: '6-Month Plan',  price: settings.price_half_yearly, period: '/ 6 months', Icon: CalendarClock, badge: 'POPULAR' },
    { id: 'yearly',      name: 'Yearly Plan',   price: settings.price_yearly,      period: '/ year',     Icon: Zap,      badge: 'BEST VALUE' },
  ]

  const activePlan = PLANS.find(p => p.id === selectedPlan) ?? PLANS[0]

  // Same UPI id the old static QR encoded (falls back to the account's own VPA).
  const upiId = settings.upi_id || 'gxnzhhh@oksbi'
  const upiName = settings.upi_name || 'GymFlow'

  /*
    The UPI intent string, per the NPCI deep-link spec. `am` is the selected plan's
    exact amount and `cu` fixes the currency, so scanning pre-fills the payee, name
    and amount in any UPI app. tr is a reference so the owner can match the payment
    later. Rebuilt whenever the amount or UPI details change.
  */
  const upiString = useMemo(() => {
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
    QRCode.toDataURL(upiString, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl('') })
    return () => { cancelled = true }
  }, [upiString])
  const [file, setFile] = useState<File | null>(null)
  const [transactionId, setTransactionId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
  const isApproved = liveRequest?.status === 'approved'
  const isRejected = liveRequest?.status === 'rejected'

  function copyUpi() {
    navigator.clipboard.writeText(settings.upi_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Please attach your payment screenshot or PDF.'); return }

    setSubmitting(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('transaction_id', transactionId)
    
    // Automatically include the selected plan in the notes for the admin
    const finalNotes = `Intended Plan: ${selectedPlan.toUpperCase()}\n${notes}`
    fd.append('notes', finalNotes.trim())

    const res = await fetch('/api/subscription/request', { method: 'POST', body: fd })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setSubmitting(false)
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
    'Unlimited staff',
    'All reports & analytics',
    'Data backup & security',
    'Regular feature updates'
  ]

  // If subscription is active (not expiring soon), show simple active state
  if (liveSubState.status === 'active' && !liveSubState.isExpired && !liveSubState.isExpiringSoon) {
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
  if (isPending && !success) {
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-8 md:py-12">
      <div className="w-full max-w-5xl space-y-8">
        
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
          <div className="bg-brand-50/80 border border-brand-100 rounded-3xl p-6 md:p-8 flex items-center justify-between relative overflow-hidden shadow-sm">
             <div className="relative z-10 space-y-3">
               <div className="flex items-center gap-3">
                 <Clock className="w-6 h-6 text-brand-500" />
                 <h2 className="text-xl md:text-2xl font-bold text-slate-900">Your Free Trial</h2>
                 <span className="px-3 py-1 bg-brand-200/50 text-brand-700 text-[11px] font-black uppercase tracking-wider rounded-full">Active</span>
               </div>
               <p className="text-sm font-bold text-slate-700">
                 You have {liveSubState.daysLeft} day{liveSubState.daysLeft !== 1 ? 's' : ''} left in your trial.
               </p>
               <p className="text-sm text-slate-500 font-medium">
                 Choose a plan early to continue using GymFlow without any interruption.
               </p>
             </div>
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

        {/* Step 1 UI */}
        {step === 1 && (
          <div className="bg-surface rounded-[2rem] border border-slate-200 p-6 md:p-10 shadow-sm">
             <div className="flex items-center gap-4 mb-8">
               <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center font-black text-sm shadow-sm shadow-brand-500/30">1</div>
               <div>
                 <h3 className="text-xl font-bold text-slate-900">Choose Your Plan</h3>
                 <p className="text-sm text-slate-500 font-medium">Select the plan that works best for your gym.</p>
               </div>
             </div>

             {/* Three tiers across on desktop, stacked on mobile. Was a 12-col grid
                 holding two plan cards plus the "All plans include" card; with a third
                 tier the plans get their own 3-up row and the include card drops below. */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch" role="radiogroup" aria-label="Subscription plan">
                {PLANS.map(plan => {
                  const isSelected = selectedPlan === plan.id
                  const PlanIcon = plan.Icon
                  return (
                    <div
                      key={plan.id}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => setSelectedPlan(plan.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPlan(plan.id) } }}
                      className={`relative cursor-pointer rounded-3xl border-2 p-6 transition-all duration-200 ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/40 shadow-md transform -translate-y-1'
                          : 'border-slate-100 bg-surface hover:border-brand-200 hover:-translate-y-1'
                      }`}
                    >
                      {plan.badge && (
                        <div className="absolute top-5 right-5 bg-brand-500 text-white text-[10px] font-black px-3 py-1 rounded-full tracking-wider shadow-sm shadow-brand-500/30">
                          {plan.badge}
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${isSelected ? 'bg-surface border-brand-100 shadow-sm' : 'bg-slate-50 border-slate-100'}`}>
                          <PlanIcon className={`w-6 h-6 ${isSelected ? 'text-brand-600' : 'text-slate-400'}`} />
                        </div>
                        {/* mt-8 clears the badge only on badged cards, so the check sits below it. */}
                        {isSelected
                          ? <CheckCircle2 className={`w-7 h-7 text-brand-600 drop-shadow-sm ${plan.badge ? 'mt-8' : ''}`} />
                          : <Circle className={`w-7 h-7 text-slate-200 ${plan.badge ? 'mt-8' : ''}`} />}
                      </div>
                      <h4 className={`text-lg font-bold mb-1 ${isSelected ? 'text-brand-700' : 'text-slate-700'}`}>{plan.name}</h4>
                      <div className="flex items-end gap-1.5 mb-8">
                        <span className="text-4xl font-black text-slate-900 tracking-tight">₹{plan.price.toLocaleString('en-IN')}</span>
                        <span className="text-sm font-bold text-slate-400 mb-1.5">{plan.period}</span>
                      </div>

                      <ul className="space-y-4">
                        {planFeatures.map((f, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm font-semibold text-slate-600">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            </div>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
             </div>

             <div className="mt-6">
                {/* All Plans Include */}
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-3xl p-6 h-fit">
                  <div className="flex items-center gap-2 mb-6">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    <h4 className="text-base font-bold text-slate-900">All plans include</h4>
                  </div>
                  <ul className="space-y-5">
                     {globalFeatures.map((f, i) => (
                       <li key={i} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                         <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                           <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                         </div>
                         {f}
                       </li>
                     ))}
                   </ul>
                </div>

             </div>

             {/* Footer Actions */}
             <div className="mt-10 pt-8 border-t border-slate-100 flex justify-end">
               <button 
                 onClick={() => setStep(2)}
                 className="px-8 py-3.5 bg-brand-500 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-md shadow-brand-500/25 flex items-center gap-2"
               >
                 Continue to Payment <ArrowRight className="w-4 h-4" />
               </button>
             </div>
          </div>
        )}

        {/* Step 2 UI */}
        {step === 2 && (
          <div className="bg-surface rounded-[2rem] border border-slate-200 p-6 md:p-10 shadow-sm flex flex-col">
             <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
                 <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center font-black text-sm shadow-sm shadow-brand-500/30">2</div>
                 <div>
                   <h3 className="text-xl font-bold text-slate-900">Make Payment</h3>
                   <p className="text-sm text-slate-500 font-medium">Pay securely using any UPI app</p>
                 </div>
               </div>
               <button onClick={() => setStep(1)} className="text-brand-600 text-sm font-bold hover:underline py-2 px-4 rounded-lg hover:bg-brand-50 transition-colors">
                 ← Back to Plans
               </button>
             </div>
             
             {/* Payment details block (QR + Instructions) */}
             <div className="flex flex-col lg:flex-row gap-8 items-stretch mb-10">
               
               {/* Left Side: QR & Details */}
               <div className="flex-1 flex flex-col sm:flex-row items-center sm:items-stretch gap-6 border border-slate-100 p-5 rounded-3xl bg-surface shadow-sm">
                 <div className="w-48 h-48 sm:w-56 sm:h-56 p-3 bg-white border border-slate-100 rounded-2xl flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                   {qrDataUrl ? (
                     /* Runtime-generated UPI QR — a data URL, so a plain img rather
                        than next/image (which optimises static/remote sources, not
                        inline data). Kept on a white tile in both themes because a QR
                        must stay dark-on-light to scan. eslint-disable-next-line @next/next/no-img-element */
                     <img
                       src={qrDataUrl}
                       alt={`UPI QR code for the ${activePlan.name} — ₹${activePlan.price.toLocaleString('en-IN')}`}
                       className="w-full h-full object-contain"
                     />
                   ) : (
                     <span className="text-[11px] font-medium text-slate-400">Generating QR…</span>
                   )}
                 </div>
                 
                 <div className="flex-1 flex flex-col justify-center space-y-4">
                   <div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">UPI ID</p>
                     <div className="flex items-center gap-3">
                       <p className="text-lg font-black text-slate-900">{settings.upi_id || 'gxnzhhh@oksbi'}</p>
                       <button onClick={copyUpi} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors" title="Copy UPI ID">
                         {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                       </button>
                     </div>
                   </div>
                   
                   <div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pay to</p>
                     <p className="text-sm font-bold text-slate-700">{settings.upi_name}</p>
                   </div>
                   
                   <div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Amount</p>
                     <p className="text-brand-600 font-black text-lg">
                       ₹{activePlan.price.toLocaleString('en-IN')}
                       <span className="text-sm font-semibold ml-1">({activePlan.name})</span>
                     </p>
                   </div>

                   <div className="flex items-start gap-2 pt-2 border-t border-slate-50">
                     <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                     <p className="text-xs text-slate-500 font-medium">Scan QR code with any UPI app<br/>GPay, PhonePe, Paytm, BHIM, etc.</p>
                   </div>
                 </div>
               </div>

               {/* Divider */}
               <div className="hidden lg:flex flex-col items-center justify-center relative px-2">
                 <div className="w-px h-full bg-slate-100"></div>
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-xs font-black text-slate-400 shadow-sm z-10">
                   OR
                 </div>
               </div>

               {/* Right Side: Instructions */}
               {/* bg-brand-50 rather than the arbitrary #F5F8FF it was: an arbitrary value
                  cannot be themed, so this panel would have stayed pale blue in dark mode. */}
              <div className="flex-1 bg-brand-50 rounded-3xl p-6 md:p-8 flex flex-col justify-between border border-brand-100/50">
                 <div>
                   <div className="flex items-center gap-2 mb-6">
                     <AlertCircle className="w-5 h-5 text-brand-600" />
                     <h4 className="text-base font-bold text-slate-900">Payment Instructions</h4>
                   </div>
                   
                   <ul className="space-y-4">
                     {[
                       'Scan the QR code or use the UPI ID',
                       'Complete the payment',
                       'Take a screenshot of the payment',
                       'Upload the screenshot below'
                     ].map((text, i) => (
                       <li key={i} className="flex items-center gap-4">
                         <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center flex-shrink-0 text-xs font-black shadow-sm shadow-brand-500/20">{i + 1}</div>
                         <span className="text-sm font-semibold text-slate-700">{text}</span>
                       </li>
                     ))}
                   </ul>
                 </div>
                 
                 <div className="mt-8 flex items-center gap-2 text-xs font-bold text-slate-500">
                   <Shield className="w-4 h-4 text-slate-400" />
                   Your payment is secure with UPI
                 </div>
               </div>
               
             </div>

             {/* Upload Form */}
             <form onSubmit={handleSubmit} className="border-t border-slate-100 pt-8 mt-2 space-y-6">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">
                    Payment Screenshot or PDF <span className="text-red-500">*</span>
                  </label>
                  
                  <input
                    type="file"
                    ref={fileRef}
                    accept="image/*,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <div 
                    onClick={() => fileRef.current?.click()}
                    className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-2 transition-colors ${
                      file ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    {file ? (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-brand-500" />
                        <span className="text-sm font-bold text-brand-700">{file.name}</span>
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
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <a
                    href="https://wa.me/919384886895?text=Hello GymFlow Support. I am having issues with my subscription payment."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline transition-all"
                  >
                    <MessageCircle className="w-4 h-4" /> Having any issues? Contact us
                  </a>

                  <button
                    type="submit"
                    disabled={submitting || !file}
                    className={`px-8 py-3.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 ${
                      submitting || !file
                        ? 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed'
                        : 'bg-brand-500 hover:bg-brand-700 text-white shadow-brand-500/25'
                    }`}
                  >
                    {submitting ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
                    ) : (
                      <>Submit Proof <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
             </form>
          </div>
        )}
      </div>
    </div>
  )
}
