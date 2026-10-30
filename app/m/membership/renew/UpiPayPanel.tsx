'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, Copy, Loader2 } from 'lucide-react'
import { generateUPILink, generateQRCode } from '@/lib/upi'
import { cn, formatCurrency } from '@/lib/utils'
import type { RenewalUpi } from '@/types/renewal'
import { markUpiOpened, upiOpenedRecently } from './paymentDraft'

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
  // True once the member tapped a UPI app and has come back to this page (or the page was reloaded after).
  const [returned, setReturned] = useState(false)
  const [opened, setOpened] = useState(false)

  // A reload while away (the phone often does this) loses `opened`, so the stored timestamp restores it.
  useEffect(() => {
    if (upiOpenedRecently()) setReturned(true)
  }, [])

  useEffect(() => {
    if (!opened) return
    const back = () => { if (document.visibilityState === 'visible') setReturned(true) }
    document.addEventListener('visibilitychange', back)
    window.addEventListener('pageshow', back)
    return () => {
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('pageshow', back)
    }
  }, [opened])

  const goToUpload = () => document.getElementById('proof-upload')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Bring the upload step into view as soon as the member is back from the UPI app.
  useEffect(() => {
    if (returned) goToUpload()
  }, [returned])

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
            onClick={() => { markUpiOpened(); setOpened(true) }}
            className={cn('flex min-h-[44px] items-center justify-center rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700 active:bg-slate-200', focusRing)}
          >
            {a.name}
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        On your phone, tap a UPI app above. The QR code is for paying from another device.
      </p>
      {returned && (
        <div role="status" className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-sm font-bold text-slate-900">Back from your UPI app?</p>
          <p className="mt-1 text-xs text-slate-600">
            If your payment went through, add the screenshot below and submit it. If you cancelled, tap a UPI app above to try again.
          </p>
          <button
            type="button"
            onClick={goToUpload}
            className={cn('mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-sm font-bold text-white', focusRing)}
          >
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
            Add my screenshot
          </button>
        </div>
      )}
    </div>
  )
}
