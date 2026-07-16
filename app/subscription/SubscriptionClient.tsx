'use client'

import { useState, useRef } from 'react'
import {
  Clock, CheckCircle, XCircle, Upload, Copy, CreditCard,
  RefreshCw, MessageCircle, AlertCircle, ArrowRight, Shield,
  Calendar, Zap,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

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
  qr_code_url: string
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
  const [file, setFile] = useState<File | null>(null)
  const [transactionId, setTransactionId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isPending  = latestRequest?.status === 'pending'
  const isApproved = latestRequest?.status === 'approved'
  const isRejected = latestRequest?.status === 'rejected'

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
    fd.append('notes', notes)

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

  const statusBadge = () => {
    if (subState.isExpired) return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
        <XCircle className="w-3.5 h-3.5" /> Trial Expired
      </div>
    )
    if (subState.status === 'trial') return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
        <Clock className="w-3.5 h-3.5" /> {subState.daysLeft} day{subState.daysLeft !== 1 ? 's' : ''} left
      </div>
    )
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
        <CheckCircle className="w-3.5 h-3.5" /> Active
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10 md:py-16">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <Image src="/logo_only.png" alt="GymFlow" width={48} height={48} className="object-contain" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Subscription &amp; Billing</h1>
          <p className="text-sm text-slate-500">{gym.name}</p>
          <div className="flex justify-center">{statusBadge()}</div>
        </div>

        {/* Active — no action needed */}
        {subState.status === 'active' && !subState.isExpired && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-6 text-center space-y-3 shadow-sm">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900">Your subscription is active</h2>
            <p className="text-sm text-slate-500">You have full access to all GymFlow features.</p>
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-700">
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Pending request */}
        {isPending && !success && (
          <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-amber-600 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Payment Under Review</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submitted {new Date(latestRequest!.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Our team is verifying your payment. This usually takes <span className="font-semibold">a few hours</span>. We'll activate your account as soon as it's confirmed.
            </p>
            <a
              href={`https://wa.me/91${settings.upi_name.replace(/\D/g, '')}?text=${encodeURIComponent('Hello GymFlow Support. I have submitted a payment proof and am waiting for verification. Please confirm status.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-emerald-600 font-semibold hover:text-emerald-700"
            >
              <MessageCircle className="w-4 h-4" /> Contact support on WhatsApp
            </a>
          </div>
        )}

        {/* Rejected — allow re-submission */}
        {isRejected && !success && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">Your previous request was rejected</p>
              {latestRequest?.rejection_reason && (
                <p className="text-xs text-red-600 mt-1">{latestRequest.rejection_reason}</p>
              )}
              <p className="text-xs text-red-600 mt-1">Please submit a new payment proof below.</p>
            </div>
          </div>
        )}

        {/* Pricing cards */}
        {(subState.isExpired || subState.status === 'trial') && !isPending && !success && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm text-center space-y-1">
              <Calendar className="w-5 h-5 text-brand-500 mx-auto" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Monthly</p>
              <p className="text-2xl font-black text-slate-900">₹{settings.price_monthly.toLocaleString('en-IN')}</p>
              <p className="text-xs text-slate-400">/ month</p>
            </div>
            <div className="bg-brand-50 rounded-2xl border border-brand-200 p-4 shadow-sm text-center space-y-1 relative overflow-hidden">
              <div className="absolute top-2 right-2">
                <span className="text-[9px] font-black bg-brand-500 text-white px-1.5 py-0.5 rounded-full">BEST VALUE</span>
              </div>
              <Zap className="w-5 h-5 text-brand-500 mx-auto" />
              <p className="text-xs font-bold text-brand-600 uppercase tracking-wide">Yearly</p>
              <p className="text-2xl font-black text-slate-900">₹{settings.price_yearly.toLocaleString('en-IN')}</p>
              <p className="text-xs text-brand-400">/ year</p>
            </div>
          </div>
        )}

        {/* Payment section */}
        {(subState.isExpired || subState.status === 'trial') && !isPending && !success && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-brand-500" />
                <h2 className="text-sm font-bold text-slate-900">Pay via UPI</h2>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* QR code */}
              {settings.qr_code_url && (
                <div className="flex justify-center">
                  <div className="p-2 border border-slate-200 rounded-xl bg-white shadow-sm">
                    <Image
                      src={settings.qr_code_url}
                      alt="UPI QR Code"
                      width={180}
                      height={180}
                      className="rounded-lg object-contain"
                    />
                  </div>
                </div>
              )}

              {/* UPI ID with copy */}
              {settings.upi_id && (
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">UPI ID</p>
                    <p className="text-sm font-bold text-slate-900 font-mono">{settings.upi_id}</p>
                  </div>
                  <button
                    onClick={copyUpi}
                    className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}

              <p className="text-xs text-slate-500 text-center">
                Pay using any UPI app (GPay, PhonePe, Paytm, etc.) and attach the screenshot below.
              </p>
            </div>
          </div>
        )}

        {/* Upload form */}
        {(subState.isExpired || subState.status === 'trial') && !isPending && !success && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-brand-500" />
                <h2 className="text-sm font-bold text-slate-900">Upload Payment Proof</h2>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* File upload */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Payment Screenshot or PDF <span className="text-red-500">*</span>
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    file ? 'border-brand-400 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-brand-50/50'
                  }`}
                >
                  {file ? (
                    <div className="space-y-1">
                      <CheckCircle className="w-6 h-6 text-brand-500 mx-auto" />
                      <p className="text-sm font-semibold text-brand-700">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                      <p className="text-sm font-medium text-slate-600">Click to upload</p>
                      <p className="text-xs text-slate-400">JPG, PNG or PDF • Max 10 MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Transaction ID */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Transaction ID <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={e => setTransactionId(e.target.value)}
                  className="input-field"
                  placeholder="e.g. 403612345678"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="input-field resize-none"
                  placeholder="Any additional info..."
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
                ) : (
                  <><Upload className="w-4 h-4" /> Submit Payment Proof</>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Success state */}
        {success && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-8 text-center shadow-sm space-y-4">
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Payment proof submitted!</h2>
              <p className="text-sm text-slate-500 mt-1">Our team will verify and activate your account shortly.</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Usually activated within a few hours</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400">
          Need help?{' '}
          <a
            href="mailto:support@gymflow.in"
            className="text-brand-600 font-semibold hover:underline"
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}
