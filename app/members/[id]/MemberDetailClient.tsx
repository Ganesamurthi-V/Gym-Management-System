'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageCircle, Plus, Trash2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buildWhatsAppLink, formatDate, formatCurrency, calcEndDate, cn } from '@/lib/utils'
import type { Member, Membership, Attendance, MemberStatus, Plan, PaymentMode } from '@/types'
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
    active: { label: 'Active', className: 'status-active' },
    expiring: { label: 'Expiring Soon', className: 'status-expiring' },
    expired: { label: 'Expired', className: 'status-expired' },
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: gym } = await supabase
        .from('gyms')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!gym) throw new Error('Gym not found')

      const end_date = calcEndDate(renewForm.start_date, renewForm.plan)

      const { error: err } = await supabase.from('memberships').insert({
        member_id: member.id,
        gym_id: gym.id,
        plan: renewForm.plan,
        start_date: renewForm.start_date,
        end_date,
        amount: parseInt(renewForm.amount),
        payment_mode: renewForm.payment_mode,
      })

      if (err) throw err

      setShowRenewForm(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to renew')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${member.name}? This cannot be undone.`)) return
    await supabase.from('attendance').delete().eq('member_id', member.id)
    await supabase.from('memberships').delete().eq('member_id', member.id)
    await supabase.from('members').delete().eq('id', member.id)
    router.push('/members')
    router.refresh()
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-white px-4 pt-10 pb-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/members" className="p-2 -ml-2 rounded-xl active:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Member Details</h1>
          </div>
          <button onClick={handleDelete} className="p-2 text-red-400 rounded-xl active:bg-red-50">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Member Info Card */}
        <div className="card p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
                  <span className="text-brand-700 font-bold text-sm">
                    {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-lg leading-tight">{member.name}</p>
                  <p className="text-gray-500 text-sm">{member.phone}</p>
                </div>
              </div>
            </div>
            <span className={cn('text-xs px-2.5 py-1 rounded-full font-semibold', statusConfig[status].className)}>
              {statusConfig[status].label}
            </span>
          </div>

          {latestMembership && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <Row label="Plan" value={latestMembership.plan.charAt(0).toUpperCase() + latestMembership.plan.slice(1)} />
              <Row label="Start" value={formatDate(latestMembership.start_date)} />
              <Row label="Expires" value={formatDate(latestMembership.end_date)} />
              <Row
                label="Status"
                value={daysRemaining >= 0
                  ? `${daysRemaining} days remaining`
                  : `${Math.abs(daysRemaining)} days overdue`}
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {latestMembership && (
            <a
              href={buildWhatsAppLink(member.phone, member.name, latestMembership.end_date)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-green-500 text-white py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Remind
            </a>
          )}
          <button
            onClick={() => setShowRenewForm(!showRenewForm)}
            className="flex items-center justify-center gap-2 bg-brand-600 text-white py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            Renew
          </button>
        </div>

        {/* Renew Form */}
        {showRenewForm && (
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Renew Membership</h3>
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
            )}
            <form onSubmit={handleRenew} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['monthly', 'quarterly', 'annual'] as Plan[]).map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setRenewForm(p => ({ ...p, plan }))}
                      className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-center ${
                        renewForm.plan === plan
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {plan === 'monthly' ? '1M' : plan === 'quarterly' ? '3M' : '12M'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={renewForm.start_date}
                  onChange={(e) => setRenewForm(p => ({ ...p, start_date: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  value={renewForm.amount}
                  onChange={(e) => setRenewForm(p => ({ ...p, amount: e.target.value }))}
                  className="input-field"
                  placeholder="1500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'upi', 'card'] as PaymentMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRenewForm(p => ({ ...p, payment_mode: mode }))}
                      className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-center ${
                        renewForm.payment_mode === mode
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Saving...' : (
                  <><Check className="w-4 h-4" /> Confirm Renewal</>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Payment History */}
        <div className="card">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-semibold text-gray-900">Payment History</h3>
          </div>
          {memberships.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No payments recorded</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {memberships.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{formatCurrency(m.amount)}</p>
                    <p className="text-xs text-gray-400">{m.payment_mode.toUpperCase()} · {formatDate(m.start_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 capitalize">{m.plan}</p>
                    <p className="text-xs text-gray-400">until {formatDate(m.end_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Attendance */}
        <div className="card mb-6">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-semibold text-gray-900">Recent Attendance</h3>
          </div>
          {attendance.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No attendance recorded</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {attendance.map((a) => (
                <div key={a.id} className="px-4 py-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <span className="text-sm text-gray-700">{formatDate(a.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}
