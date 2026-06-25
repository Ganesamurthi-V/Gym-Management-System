'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import SupportTicketModal from './SupportTicketModal'

export default function SupportHeaderClient() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contact & Support</h1>
        <p className="text-slate-500 text-sm mt-1">Updates and support messages from the GymDesk team</p>
      </div>
      
      <button 
        onClick={() => setIsModalOpen(true)}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm">Submit Ticket</span>
      </button>

      <SupportTicketModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}
