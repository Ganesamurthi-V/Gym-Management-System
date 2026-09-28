'use client'

import { useEffect, useRef } from 'react'

interface Props {
  memberCode: string
}

/**
 * Compact QR block shown at the top of the Membership page so a member can
 * check in without navigating to the full card. Reuses the same `qrcode`
 * library and encoding (the raw member code) as MembershipCardClient, loaded
 * lazily so it stays out of the initial bundle.
 */
export default function MembershipQR({ memberCode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvas, memberCode, {
        width: 200,
        margin: 1,
        color: { dark: '#1e40af', light: '#ffffff' },
      }).catch(() => {})
    })
  }, [memberCode])

  return (
    <section className="card mb-5 flex flex-col items-center p-6">
      <p className="mb-4 text-sm font-semibold text-slate-600">Show this at the gym entrance</p>
      {/* White plate keeps the QR scannable in dark mode, where the card
          surface is near-black. */}
      <div className="rounded-xl bg-white p-3">
        <canvas ref={canvasRef} className="rounded-lg" />
      </div>
      <p className="mt-3 font-mono text-sm font-bold tracking-widest text-slate-700">{memberCode}</p>
      <p className="mt-1 text-xs text-slate-400">Scan to verify membership</p>
    </section>
  )
}
