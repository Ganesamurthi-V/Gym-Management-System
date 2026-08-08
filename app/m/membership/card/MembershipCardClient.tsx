'use client'

import { useEffect, useRef } from 'react'
import type { MembershipStatus } from '@/lib/member/member-data'
import { formatPlan } from '@/lib/member/member-utils'

interface Props {
  memberName: string
  memberCode: string
  gymName: string
  plan: string | null
  endDate: string | null
  status: MembershipStatus
}

const STATUS_COLOURS: Record<MembershipStatus, string> = {
  active:   'bg-emerald-500',
  expiring: 'bg-amber-500',
  expired:  'bg-red-500',
  none:     'bg-slate-400',
}

export default function MembershipCardClient({ memberName, memberCode, gymName, plan, endDate, status }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Generate QR code from member code using the qrcode library loaded lazily
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
    <div className="space-y-5">
      {/* Physical-card style */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-900 p-6 text-white shadow-2xl shadow-brand-900/30">
        {/* Background pattern */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-white/5" />

        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-200">GymFlow Member</p>
          <p className="mt-1 truncate text-xl font-bold">{memberName}</p>
          <p className="text-sm text-brand-200">{gymName}</p>

          <div className="mt-4 flex items-end justify-between">
            <div>
              {plan && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brand-300">Plan</p>
                  <p className="text-sm font-bold">{formatPlan(plan)}</p>
                </>
              )}
              {endDate && (
                <p className="mt-1 text-xs text-brand-200">Expires {endDate}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${STATUS_COLOURS[status]}`}>
                {status === 'none' ? 'No plan' : status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <p className="font-mono text-xs font-bold tracking-wider text-brand-100">{memberCode}</p>
            </div>
          </div>
        </div>
      </div>

      {/* QR code */}
      <div className="card flex flex-col items-center p-6">
        <p className="mb-4 text-sm font-semibold text-slate-600">Show this at the gym entrance</p>
        <canvas ref={canvasRef} className="rounded-xl" />
        <p className="mt-3 font-mono text-sm font-bold tracking-widest text-slate-700">{memberCode}</p>
        <p className="mt-1 text-xs text-slate-400">Scan to verify membership</p>
      </div>
    </div>
  )
}
