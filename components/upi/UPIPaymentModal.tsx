'use client'

import { useState, useEffect } from 'react'
import { X, QrCode, Wallet, Loader2, Clock, CheckCircle2 } from 'lucide-react'
import { generateUPILink, generateQRCode } from '@/lib/upi'
import { formatCurrency } from '@/lib/utils'

interface MerchantConfig {
  upi_id: string
  merchant_name: string
  merchant_code?: string | null
  currency?: string
}

interface Props {
  /** Whether the modal is open */
  open: boolean
  /** Close the modal */
  onClose: () => void
  /** Called when the user picks "Generate QR Code" and the QR is shown (payment pending) */
  onGenerateQR?: () => void
  /** Called when the user picks "I'll Collect It Myself" — continues the flow without QR */
  onCollectManually: () => void
  /** The merchant UPI config from the gym */
  merchantConfig: MerchantConfig | null
  /** The membership amount to collect */
  amount: number
  /** Member name (displayed on the QR screen) */
  memberName: string
}

type Step = 'choose' | 'qr'

/**
 * UPI Payment Modal
 *
 * Shown when the user selects "UPI" as payment mode during member creation.
 * Offers two options:
 *   1. Generate QR Code — creates a fresh UPI payment URI and displays QR
 *   2. I'll Collect It Myself — closes modal and continues the save flow
 *
 * Future-proofed for realtime payment verification.
 */
export default function UPIPaymentModal({
  open,
  onClose,
  onGenerateQR,
  onCollectManually,
  merchantConfig,
  amount,
  memberName,
}: Props) {
  const [step, setStep] = useState<Step>('choose')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [upiUri, setUpiUri] = useState<string | null>(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setStep('choose')
      setQrDataUrl(null)
      setUpiUri(null)
    }
  }, [open])

  async function handleGenerateQR() {
    if (!merchantConfig) return

    setGenerating(true)
    try {
      const uri = generateUPILink({
        upiId: merchantConfig.upi_id,
        merchantName: merchantConfig.merchant_name,
        amount,
        merchantCode: merchantConfig.merchant_code,
        currency: merchantConfig.currency ?? 'INR',
        transactionNote: `GymFlow Membership - ${memberName}`,
        // Future: add transactionRef here for payment verification
      })
      setUpiUri(uri)

      const dataUrl = await generateQRCode(uri, 280)
      setQrDataUrl(dataUrl)
      setStep('qr')
      onGenerateQR?.()
    } catch (err) {
      console.error('Failed to generate QR:', err)
    } finally {
      setGenerating(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-900">
              {step === 'choose' ? 'Collect Payment via UPI' : 'Scan to Pay'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Choose */}
        {step === 'choose' && (
          <div className="p-6 space-y-5">
            <p className="text-sm text-slate-500">
              Choose how you want to collect this payment.
            </p>

            {/* Amount badge */}
            <div className="flex items-center justify-center">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-2.5 text-center">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">Amount</p>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(amount)}</p>
              </div>
            </div>

            {/* Option 1: Generate QR */}
            <button
              onClick={handleGenerateQR}
              disabled={generating || !merchantConfig}
              className="w-full flex items-start gap-4 p-4 bg-white border-2 border-slate-200 rounded-xl hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-11 h-11 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 transition-colors">
                {generating ? (
                  <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
                ) : (
                  <QrCode className="w-5 h-5 text-brand-600" />
                )}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Generate QR Code</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Generate a payment QR code for this membership. The member scans the QR and pays instantly.
                </p>
              </div>
            </button>

            {/* Option 2: Collect Manually */}
            <button
              onClick={onCollectManually}
              className="w-full flex items-start gap-4 p-4 bg-white border-2 border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all text-left group"
            >
              <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-slate-200 transition-colors">
                <Wallet className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">I'll Collect It Myself</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  I will collect the payment manually using my own UPI app or another method.
                </p>
              </div>
            </button>

            {!merchantConfig && (
              <p className="text-xs text-amber-600 font-medium text-center bg-amber-50 border border-amber-200 rounded-lg p-2">
                UPI QR not configured. Go to Account Settings to set up your merchant QR code.
              </p>
            )}

            {/* Cancel */}
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Step: QR Display */}
        {step === 'qr' && (
          <div className="p-6 space-y-5">
            {/* Member + Amount */}
            <div className="text-center space-y-1">
              <p className="text-sm text-slate-500">Payment for</p>
              <p className="font-bold text-slate-900 text-lg">{memberName}</p>
              <p className="text-2xl font-black text-brand-600">{formatCurrency(amount)}</p>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center">
              <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="UPI Payment QR Code"
                    width={280}
                    height={280}
                    className="rounded-lg"
                  />
                ) : (
                  <div className="w-[280px] h-[280px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
                  </div>
                )}
              </div>

              {/* Merchant info */}
              <div className="mt-3 text-center">
                <p className="text-xs text-slate-400">Paying to</p>
                <p className="text-sm font-bold text-slate-700">
                  {merchantConfig?.merchant_name} &middot; {merchantConfig?.upi_id}
                </p>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center justify-center gap-2 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-700">Waiting for payment...</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={onCollectManually}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Mark as Collected
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
