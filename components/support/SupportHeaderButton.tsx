'use client'

import { useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import SupportTicketModal from './SupportTicketModal'

/*
  Header entry point to Contact Support & Feedback.

  Sits in the owner console header cluster (beside the theme toggle and account
  menu). It opens the shared SupportTicketModal, which has both a "Contact support"
  and a "Give feedback" tab — so both live one click away from every /owner page,
  not just the support page.

  Icon-only on small screens to save header room; icon + label from md up.
*/
export default function SupportHeaderButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Contact support & feedback"
        aria-label="Contact support and feedback"
        className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 ${className}`}
      >
        <LifeBuoy className="h-4 w-4" />
        <span className="hidden lg:inline">Support</span>
      </button>

      <SupportTicketModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  )
}
