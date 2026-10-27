'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { generateUPILink, generateQRCode } from '@/lib/upi'
import { cn, formatCurrency } from '@/lib/utils'
import type { RenewalUpi } from '@/types/renewal'

const UPI_PREFIX = 'upi://pay?'

// Swap only the scheme/host prefix of the standard upi://pay? link for each app's deep link.
const UPI_APPS = [
  { name: 'Google Pay', prefix: 'tez://upi/pay?' },
  { name: 'PhonePe', prefix: 'phonepe://pay?' },
  { name: 'Paytm', prefix: 'paytmmp://pay?' },
]

export const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'

/** QR + payee + copy UPI ID + UPI app buttons for one amount. Shared by the renew and pay-due flows. */
export default function UpiPayPanel({ upi, amount, note }: { upi: RenewalUpi; amount: number; note: string }) {
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const upiLink = useMemo(
    () =>
      generateUPILink({
        upiId: upi.upiId,
        merchantName: upi.merchantName,
        amount,
        transactionNote: note,
        merchantCode: upi.merchantCode ?? undefined,
      }),
    [upi, amount, note],
  )

  useEffect(() => {
    let cancelled = false
    generateQRCode(upiLink, 280)
      .then((url) => { if (!cancelled) setQr(url) })
      .catch(() => { if (!cancelled) setQr(null) })
    return () => { cancelled = true }
  }, [upiLink])

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upi.upiId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this UPI ID', upi.upiId)
    }
  }

  const appLinks = [
    ...UPI_APPS.map((a) => ({ name: a.name, href: a.prefix + upiLink.slice(UPI_PREFIX.length) })),
    { name: 'Other UPI app', href: upiLink },
  ]

  return (
    <div className="card mt-3 rounded-2xl p-4">
      <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center rounded-2xl bg-white p-3">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`UPI QR code to pay ${formatCurrency(amount)} to ${upi.merchantName}`} className="h-full w-full" />
        ) : (
          <Loader2 aria-label="Loading QR code" className="h-6 w-6 animate-spin text-slate-400" />
        )}
      </div>
      <p className="mt-3 text-center text-sm font-bold text-slate-900">{upi.merchantName}</p>
      <div className="mt-1 flex items-center justify-center gap-2">
        <span className="break-all text-xs text-slate-500">{upi.upiId}</span>
        <button
          type="button"
          onClick={copyUpi}
          className={cn('inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-bold text-brand-600', focusRing)}
        >
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy UPI ID'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {appLinks.map((a) => (
          <a
            key={a.name}
            href={a.href}
            className={cn('flex min-h-[44px] items-center justify-center rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700 active:bg-slate-200', focusRing)}
          >
            {a.name}
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        On your phone, tap a UPI app above. The QR code is for paying from another device.
      </p>
    </div>
  )
}
