'use client'

import { useState } from 'react'
import { MessageCircle, Check, IndianRupee, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface DueMember {
  id: string
  name: string
  phone: string
  member_number: number
  pending_amount: number
  status: string
}

interface Props {
  members: DueMember[]
  gymId: string
  totalDues: number
}

export function DuesClient({ members: initialMembers, gymId, totalDues }: Props) {
  const [members, setMembers] = useState(initialMembers)
  const [paying, setPaying] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState<string>('cash')
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()
  const supabase = createClient()

  function buildDueWhatsApp(phone: string, name: string, amount: number) {
    const msg = encodeURIComponent(
      `Hi ${name}! 🏋️ You have a pending due of ₹${amount.toLocaleString('en-IN')} at our gym. Please clear it at your earliest convenience. Thank you!`
    )
    const clean = phone.replace(/\D/g, '')
    const num = clean.startsWith('91') ? clean : `91${clean}`
    return `https://wa.me/${num}?text=${msg}`
  }

  async function handleCollect(member: DueMember) {
    const amt = parseInt(payAmount)
    if (!amt || amt <= 0) return
    const collect = Math.min(amt, member.pending_amount)
    const newPending = member.pending_amount - collect

    const { error } = await supabase
      .from('members')
      .update({ pending_amount: newPending })
      .eq('id', member.id)

    if (error) {
      alert('Failed to record payment. Please try again.')
    } else {
      // Record the due payment
      await supabase.from('due_payments').insert({
        gym_id: gymId,
        member_id: member.id,
        amount: collect,
        payment_mode: payMode
      })

      const { invalidateMembersCache } = await import('../members/actions')
      await invalidateMembersCache(gymId)

      // Also invalidate payments cache
      const { deleteCache } = await import('@/lib/cache')
      await deleteCache(`gym:${gymId}:payments_page:12mo`)
      await deleteCache(`gym:${gymId}:payments_page:allTime`)

      setMembers(prev => prev
        .map(m => m.id === member.id ? { ...m, pending_amount: newPending } : m)
        .filter(m => m.pending_amount > 0)
      )
      setPaying(null)
      setPayAmount('')
      setPayMode('cash')
      router.refresh()
    }
  }

  return (
    <div className="space-y-4 md:space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Fee Dues</h1>
          <div className="card px-4 py-2.5 flex items-center gap-2 sm:hidden">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <div>
              <p className="text-xs text-slate-400">Total Pending</p>
              <p className="text-base font-bold text-red-600">{formatCurrency(totalDues)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="search"
            placeholder="Search by ID, Name or Phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field w-full sm:w-64"
          />
          <div className="card px-4 py-2.5 hidden sm:flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <div>
              <p className="text-xs text-slate-400">Total Pending</p>
              <p className="text-base font-bold text-red-600">{formatCurrency(totalDues)}</p>
            </div>
          </div>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-slate-500 font-medium">No pending dues!</p>
          <p className="text-slate-400 text-sm mt-1">All members are up to date</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="space-y-3">
            {members.filter((m) => {
              if (!searchQuery) return true;
              const query = searchQuery.toLowerCase();
              return m.name.toLowerCase().includes(query) || 
                     m.phone.includes(query) || 
                     String(m.member_number).includes(query);
            }).map(member => (
              <div key={member.id} className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-red-600 font-bold text-sm">
                      {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 text-sm">{member.name}</p>
                      <span className="text-xs text-slate-400">#{member.member_number}</span>
                    </div>
                    <p className="text-xs text-slate-400">{member.phone}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-red-600">{formatCurrency(member.pending_amount)}</p>
                    <p className="text-xs text-slate-400">pending</p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    <a href={buildDueWhatsApp(member.phone, member.name, member.pending_amount)}
                      target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center hover:bg-emerald-600 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => { setPaying(paying === member.id ? null : member.id); setPayAmount(String(member.pending_amount)) }}
                      className="w-8 h-8 bg-brand-500 text-white rounded-lg flex items-center justify-center hover:bg-brand-600 transition-colors"
                    >
                      <IndianRupee className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Inline collect form */}
                {paying === member.id && (
                  <div className="mt-3 flex items-center gap-2 pl-13">
                    <input
                      type="number"
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      className="input-field w-36"
                      placeholder="Amount collected"
                      min="1"
                      max={member.pending_amount}
                      autoFocus
                    />
                    <select
                      value={payMode}
                      onChange={e => setPayMode(e.target.value)}
                      className="input-field w-28 py-2"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                    </select>
                    <button
                      onClick={() => handleCollect(member)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                    >
                      <Check className="w-4 h-4" /> Collect
                    </button>
                    <button onClick={() => setPaying(null)} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
