'use client'

import { useState } from 'react'
import { QrCode } from 'lucide-react'
import { Sheet } from '@/components/ui/motion'
import MembershipQR from '@/app/m/membership/MembershipQR'
import type { MembershipStatus } from '@/lib/member/member-data'

interface Props {
  plan: string
  status: MembershipStatus
  endDate: string
  daysLeft: number | null
  memberCode: string
}

const STATUS_LABEL: Record<MembershipStatus, string> = {
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired',
  none: 'No membership',
}

/**
 * The one filled element on Me. Tapping it opens the check-in QR in a sheet, so a member reaches
 * the QR from any tab in two taps (avatar, card) without a separate page.
 */
export function MembershipWalletCard({ plan, status, endDate, daysLeft, memberCode }: Readonly<Props>) {
  const [open, setOpen] = useState(false)

  const validity =
    status === 'expired'
      ? `Expired on ${endDate}`
      : `Valid until ${endDate}${daysLeft !== null && daysLeft > 0 ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show membership QR"
        className="relative block w-full overflow-hidden rounded-3xl bg-brand-500 p-5 text-left text-white shadow-lg shadow-brand-900/20 transition-transform active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <span className="relative flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-widest text-brand-100">Membership</span>
            <span className="mt-1 block truncate text-2xl font-bold tracking-tight">{plan}</span>
          </span>
          <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">{STATUS_LABEL[status]}</span>
        </span>
        <span className="relative mt-5 flex items-end justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{validity}</span>
            <span className="mt-1 block font-mono text-xs font-bold tracking-wider text-brand-100">{memberCode}</span>
          </span>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-600">
            <QrCode aria-hidden="true" className="h-6 w-6" />
          </span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Membership QR">
        <MembershipQR memberCode={memberCode} />
      </Sheet>
    </>
  )
}
