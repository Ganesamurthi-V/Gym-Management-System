'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { ArrowLeft, MessageCircle, Plus, Trash2, Check, Calendar, CreditCard, Edit2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buildWhatsAppLink, formatDate, formatCurrency, calcEndDate, cn, isValidPhone } from '@/lib/utils'
import type { Member, Membership, Attendance, MemberStatus, Plan, PaymentMode } from '@/types'
import { formatMemberId } from '@/types'
import { format } from 'date-fns'

interface Props {
  member: Member
  memberships: Membership[]
  attendance: Attendance[]
  status: MemberStatus
  daysRemaining: number
}

export function MemberDetailClient({ member, memberships, attendance, status, daysRemaining }: Props) {
  const [showRenewForm, setShowRenewForm] = useState(false)
  const [renewForm, setRenewForm] = useState({
    plan: 'monthly' as Plan,
    custom_months: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    payment_mode: 'cash' as PaymentMode,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const latestMembership = memberships[0] ?? null

  const statusConfig = {
    active:   { label: 'Active',        className: 'bg-emerald-100 text-emerald-700', bar: 'from-emerald-400 to-emerald-600' },
    expiring: { label: 'Expiring Soon', className: 'bg-amber-100 text-amber-700',    bar: 'from-amber-400 to-amber-600' },
    expired:  { label: 'Expired',       className: 'bg-red-100 text-red-700',         bar: 'from-red-400 to-red-600' },
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
      if (!gym) throw new Error('Gym not found')
      const end_date = calcEndDate(renewForm.start_date, renewForm.plan, renewForm.plan === 'custom' ? parseInt(renewForm.custom_months) || 1 : undefined)
      const { error: err } = await supabase.from('memberships').insert({
        member_id: member.id,
        gym_id: gym.id,
        plan: renewForm.plan === 'custom' ? 'monthly' : renewForm.plan,
        start_date: renewForm.start_date,
        end_date,
        amount: parseInt(renewForm.amount),
        payment_mode: renewForm.payment_mode,
      })
      if (err) throw err
      setShowRenewForm(false)
      toast.success('Membership renewed successfully!')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to renew')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${member.name}? This cannot be undone.`)) return
    try {
      const { error: e1 } = await supabase.from('attendance').delete().eq('member_id', member.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('memberships').delete().eq('member_id', member.id)
      if (e2) throw e2
      const { error: e3 } = await supabase.from('members').delete().eq('id', member.id)
      if (e3) throw e3
      toast.success('Member deleted successfully')
      router.push('/members')
      router.refresh()
    } catch (err: any) {
      toast.error('Failed to delete member: ' + (err.message || 'Unknown error'))
    }
  }

  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 md:gap-3">
          <Link href="/members" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Members
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Member Details</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/members/${member.id}/edit`}
            className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 px-3 py-2 rounded-lg hover:bg-brand-50 transition-all font-semibold">
            <Edit2 className="w-4 h-4" />Edit
          </Link>
          <button onClick={handleDelete} className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition-all">
            <Trash2 className="w-4 h-4" />Delete
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className={`bg-gradient-to-br ${statusConfig[status].bar} p-5`}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/25 rounded-2xl flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xl">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-xl leading-tight truncate">{member.name}</p>
              <p className="text-white/80 text-sm mt-0.5">{member.phone}</p>
              <p className="text-white/60 text-xs mt-0.5">{formatMemberId(member.member_number)}</p>
              <span className={cn('inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full', statusConfig[status].className)}>
                {statusConfig[status].label}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {member.gender && <InfoTile label="Gender" value={member.gender.charAt(0).toUpperCase() + member.gender.slice(1)} />}
          {member.age && <InfoTile label="Age" value={`${member.age} yrs`} />}
          {member.area && <InfoTile label="Area" value={member.area} />}
          {member.legacy_member_id && <InfoTile label="Legacy ID" value={member.legacy_member_id} />}
          {latestMembership && (
            <>
              <InfoTile label="Plan" value={latestMembership.plan.charAt(0).toUpperCase() + latestMembership.plan.slice(1)} />
              <InfoTile label="Start Date" value={formatDate(latestMembership.start_date)} />
              <InfoTile label="Expires" value={formatDate(latestMembership.end_date)} />
              <InfoTile
                label="Days"
                value={daysRemaining >= 0 ? `${daysRemaining} remaining` : `${Math.abs(daysRemaining)} overdue`}
                highlight={daysRemaining < 0}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {latestMembership && (
          isValidPhone(member.phone) ? (
            <a href={buildWhatsAppLink(member.phone, member.name, latestMembership.end_date)}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3.5 rounded-2xl font-semibold text-sm shadow-md shadow-emerald-200 active:scale-[0.98] transition-all"
            >
              <MessageCircle className="w-4 h-4" />WhatsApp
            </a>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400 py-3.5 rounded-2xl text-sm cursor-not-allowed">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                <span className="font-semibold">WhatsApp</span>
              </div>
              <span className="text-[10px] text-center px-2 leading-tight">Invalid phone number — cannot send message</span>
            </div>
          )
        )}
        <button onClick={() => setShowRenewForm(!showRenewForm)}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white py-3.5 rounded-2xl font-semibold text-sm shadow-md shadow-brand-200 active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />Renew
        </button>
      </div>

      {showRenewForm && (
        <div className="card p-4">
          <h3 className="font-bold text-slate-900 mb-4">Renew Membership</h3>
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
          <form onSubmit={handleRenew} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Plan</label>
              <div className="grid grid-cols-4 gap-2">
                {(['monthly', 'quarterly', 'annual', 'custom'] as Plan[]).map((plan) => (
                  <button key={plan} type="button" onClick={() => setRenewForm(p => ({ ...p, plan }))}
                    className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all text-center ${
                      renewForm.plan === plan ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {plan === 'monthly' ? '1M' : plan === 'quarterly' ? '3M' : plan === 'annual' ? '12M' : 'Custom'}
                  </button>
                ))}
              </div>
              {renewForm.plan === 'custom' && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" min="1" max="24" value={renewForm.custom_months}
                    onChange={(e) => setRenewForm(p => ({ ...p, custom_months: e.target.value }))}
                    className="input-field w-28" placeholder="e.g. 2" required />
                  <span className="text-sm text-slate-500 font-medium">months</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Start Date</label>
              <input type="date" value={renewForm.start_date} onChange={(e) => setRenewForm(p => ({ ...p, start_date: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Amount (₹)</label>
              <input type="number" value={renewForm.amount} onChange={(e) => setRenewForm(p => ({ ...p, amount: e.target.value }))} className="input-field" placeholder="1500" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Payment Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'upi', 'card'] as PaymentMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => setRenewForm(p => ({ ...p, payment_mode: mode }))}
                    className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all text-center ${
                      renewForm.payment_mode === mode ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Saving...' : <><Check className="w-4 h-4" /> Confirm Renewal</>}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-2 p-4 border-b border-slate-50">
          <div className="w-7 h-7 bg-brand-50 rounded-xl flex items-center justify-center">
            <CreditCard className="w-3.5 h-3.5 text-brand-600" />
          </div>
          <h3 className="font-bold text-slate-900">Payment History</h3>
        </div>
        {memberships.length === 0 ? (
          <p className="p-5 text-sm text-slate-400 text-center">No payments recorded</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {memberships.map((m) => (
              <div key={m.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{formatCurrency(m.amount + (m.admission_fee ?? 0))}</p>
                    {(m.admission_fee ?? 0) > 0 && (
                      <span className="text-xs text-slate-400">
                        (membership {formatCurrency(m.amount)}, admission {formatCurrency(m.admission_fee ?? 0)})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{m.payment_mode.toUpperCase()} · {formatDate(m.start_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-700 capitalize">{m.plan}</p>
                  <p className="text-xs text-slate-400">until {formatDate(m.end_date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-2 p-4 border-b border-slate-50">
          <div className="w-7 h-7 bg-emerald-50 rounded-xl flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <h3 className="font-bold text-slate-900">Recent Attendance</h3>
        </div>
        {attendance.length === 0 ? (
          <p className="p-5 text-sm text-slate-400 text-center">No attendance recorded</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {attendance.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                <span className="text-sm text-slate-700 font-medium">{formatDate(a.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
