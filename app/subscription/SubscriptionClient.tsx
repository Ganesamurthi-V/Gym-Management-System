'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Clock, CheckCircle, XCircle, Upload, Copy, CreditCard,
  RefreshCw, MessageCircle, AlertCircle, ArrowRight, Shield,
  Calendar, Zap, Check, Circle, CheckCircle2
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { computeSubscriptionState } from '@/lib/subscription-utils'

interface GymInfo {
  id: string
  name: string
  subscriptionStatus: string
  trialEndsAt: string | null
}

interface SubState {
  status: string
  daysLeft: number | null
  isExpired: boolean
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
  price_yearly: number
}

interface Props {
  gym: GymInfo
  subState: SubState
  latestRequest: LatestRequest | null
  settings: Settings
}

export default function SubscriptionClient({ gym, subState, latestRequest, settings }: Props) {
  const [step, setStep] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly')
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

  // ── Realtime listeners ────────────────────────
  useEffect(() => {
    const supabase = createClient()
    
    // Listen to subscription_requests for this gym
    const reqChannel = supabase
      .channel(`gym-${gym.id}-requests`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'subscription_requests',
          filter: `gym_id=eq.${gym.id}`,
        },
        (payload: any) => {
          const { status, rejection_reason } = payload.new
          
          setLiveRequest(prev => prev ? { ...prev, status, rejection_reason } : payload.new)
          
          if (status === 'rejected') {
            toast.error('Your payment request was rejected.')
            setSuccess(false) // If they were on the success screen, drop them back to plans
          } else if (status === 'approved') {
            // ShellGuard will handle the redirect, but we can show success state instantly
            setSuccess(true)
            toast.success('Payment approved! Redirecting...')
          }
        }
      )
      .subscribe()

    // Listen to gyms table for this gym (subscription status changes)
    const gymChannel = supabase
      .channel(`gym-${gym.id}-subclient`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gyms',
          filter: `id=eq.${gym.id}`,
        },
        (payload: any) => {
          const newState = computeSubscriptionState(payload.new)
          setLiveSubState(newState)
        }
      )
      .subscribe()

    return () => { 
      supabase.removeChannel(reqChannel)
      supabase.removeChannel(gymChannel)
    }
  }, [gym.id])

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

  // If subscription is active, show simple active state
  if (liveSubState.status === 'active' && !liveSubState.isExpired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-emerald-200 p-10 text-center space-y-4 shadow-sm max-w-md w-full">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Your subscription is active</h2>
          <p className="text-sm text-slate-500">You have full access to all GymFlow features.</p>
          <Link href="/dashboard" className="inline-flex items-center justify-center w-full py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition-colors">
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
        <div className="bg-white rounded-2xl border border-amber-200 p-8 shadow-sm max-w-md w-full text-center space-y-4">
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
        <div className="bg-white rounded-3xl border border-emerald-200 p-10 text-center shadow-sm max-w-md w-full space-y-5">
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
                 <h2 className="text-xl md:text-2xl font-bold text-slate-900">Your Trial Has Expired</h2>
                 <span className="px-3 py-1 bg-red-200/50 text-red-700 text-[11px] font-black uppercase tracking-wider rounded-full">Expired</span>
               </div>
               <p className="text-sm font-bold text-slate-700">
                 Your 14-day free trial ended on {gym.trialEndsAt ? new Date(gym.trialEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}.
               </p>
               <p className="text-sm text-slate-500 font-medium">
                 Choose a plan and continue using GymFlow without any interruption.
               </p>
             </div>
             
             {/* Decorative Graphic */}
             <div className="hidden md:flex absolute -right-6 -bottom-8 opacity-20 transform rotate-[-10deg]">
               <Calendar className="w-48 h-48 text-red-500" />
               <Clock className="w-20 h-20 text-red-600 absolute bottom-10 -left-6 bg-red-50 rounded-full" />
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
          <div className="bg-white rounded-[2rem] border border-slate-200 p-6 md:p-10 shadow-sm">
             <div className="flex items-center gap-4 mb-8">
               <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-black text-sm shadow-sm shadow-brand-500/30">1</div>
               <div>
                 <h3 className="text-xl font-bold text-slate-900">Choose Your Plan</h3>
                 <p className="text-sm text-slate-500 font-medium">Select the plan that works best for your gym.</p>
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                
                {/* Monthly */}
                <div 
                  onClick={() => setSelectedPlan('monthly')}
                  className={`md:col-span-4 cursor-pointer rounded-3xl border-2 p-6 transition-all duration-200 ${
                    selectedPlan === 'monthly' ? 'border-brand-500 bg-brand-50/40 shadow-md transform -translate-y-1' : 'border-slate-100 bg-white hover:border-brand-200 hover:-translate-y-1'
                  }`}
                >
                   <div className="flex justify-between items-start mb-5">
                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${selectedPlan === 'monthly' ? 'bg-white border-brand-100 shadow-sm' : 'bg-slate-50 border-slate-100'}`}>
                       <Calendar className={`w-6 h-6 ${selectedPlan === 'monthly' ? 'text-brand-600' : 'text-slate-400'}`} />
                     </div>
                     {selectedPlan === 'monthly' ? (
                       <CheckCircle2 className="w-7 h-7 text-brand-600 drop-shadow-sm" />
                     ) : (
                       <Circle className="w-7 h-7 text-slate-200" />
                     )}
                   </div>
                   <h4 className={`text-lg font-bold mb-1 ${selectedPlan === 'monthly' ? 'text-brand-700' : 'text-slate-700'}`}>Monthly Plan</h4>
                   <div className="flex items-end gap-1.5 mb-8">
                     <span className="text-4xl font-black text-slate-900 tracking-tight">₹{settings.price_monthly.toLocaleString('en-IN')}</span>
                     <span className="text-sm font-bold text-slate-400 mb-1.5">/ month</span>
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

                {/* Yearly */}
                <div 
                  onClick={() => setSelectedPlan('yearly')}
                  className={`md:col-span-4 cursor-pointer rounded-3xl border-2 p-6 transition-all duration-200 relative ${
                    selectedPlan === 'yearly' ? 'border-brand-500 bg-brand-50/40 shadow-md transform -translate-y-1' : 'border-slate-100 bg-white hover:border-brand-200 hover:-translate-y-1'
                  }`}
                >
                   <div className="absolute top-5 right-5 bg-brand-600 text-white text-[10px] font-black px-3 py-1 rounded-full tracking-wider shadow-sm shadow-brand-500/30">BEST VALUE</div>
                   <div className="flex justify-between items-start mb-5">
                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${selectedPlan === 'yearly' ? 'bg-white border-brand-100 shadow-sm' : 'bg-amber-50 border-amber-100/50'}`}>
                       <Zap className={`w-6 h-6 ${selectedPlan === 'yearly' ? 'text-brand-600' : 'text-amber-500'}`} />
                     </div>
                     {selectedPlan === 'yearly' ? (
                       <CheckCircle2 className="w-7 h-7 text-brand-600 mt-8 drop-shadow-sm" /> 
                     ) : (
                       <Circle className="w-7 h-7 text-slate-200 mt-8" />
                     )}
                   </div>
                   <h4 className={`text-lg font-bold mb-1 ${selectedPlan === 'yearly' ? 'text-brand-700' : 'text-slate-700'}`}>Yearly Plan</h4>
                   <div className="flex items-end gap-1.5 mb-8">
                     <span className="text-4xl font-black text-slate-900 tracking-tight">₹{settings.price_yearly.toLocaleString('en-IN')}</span>
                     <span className="text-sm font-bold text-slate-400 mb-1.5">/ year</span>
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

                {/* All Plans Include */}
                <div className="md:col-span-4 bg-emerald-50/60 border border-emerald-100 rounded-3xl p-6 h-fit mt-2 md:mt-4">
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
                 className="px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-md shadow-brand-500/25 flex items-center gap-2"
               >
                 Continue to Payment <ArrowRight className="w-4 h-4" />
               </button>
             </div>
          </div>
        )}

        {/* Step 2 UI */}
        {step === 2 && (
          <div className="bg-white rounded-[2rem] border border-slate-200 p-6 md:p-10 shadow-sm flex flex-col">
             <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
                 <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-black text-sm shadow-sm shadow-brand-500/30">2</div>
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
               <div className="flex-1 flex flex-col sm:flex-row items-center sm:items-stretch gap-6 border border-slate-100 p-5 rounded-3xl bg-white shadow-sm">
                 <div className="w-48 h-48 sm:w-56 sm:h-56 p-3 bg-slate-50 border border-slate-100 rounded-2xl flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                   <Image
                     src={selectedPlan === 'monthly' ? '/2999.jpeg' : '/29k.jpeg'}
                     alt={`UPI QR Code for ${selectedPlan} plan`}
                     fill
                     className="object-contain p-2"
                   />
                 </div>
                 
                 <div className="flex-1 flex flex-col justify-center space-y-4">
                   <div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">UPI ID</p>
                     <div className="flex items-center gap-3">
                       <p className="text-lg font-black text-slate-900">{settings.upi_id || 'gymflow@okaxis'}</p>
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
                       ₹{selectedPlan === 'monthly' ? settings.price_monthly.toLocaleString('en-IN') : settings.price_yearly.toLocaleString('en-IN')} 
                       <span className="text-sm font-semibold ml-1">({selectedPlan === 'monthly' ? 'Monthly' : 'Yearly'})</span>
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
               <div className="flex-1 bg-[#F5F8FF] rounded-3xl p-6 md:p-8 flex flex-col justify-between border border-brand-100/50">
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
                         <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-black shadow-sm shadow-brand-500/20">{i + 1}</div>
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
                    className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium placeholder:font-normal"
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
                        : 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/25'
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
