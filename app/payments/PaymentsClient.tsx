'use client'

import { useState } from 'react'
import { CreditCard, Banknote, Smartphone, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Membership } from '@/types'
import { format } from 'date-fns'

interface Payment extends Membership {
  member?: { name: string; phone: string }
}

interface Props {
  payments: Payment[]
  gymId: string
  monthRevenue: number
  cashRevenue: number
  upiRevenue: number
}

export function PaymentsClient({ payments, gymId, monthRevenue, cashRevenue, upiRevenue }: Props) {
  const [filter, setFilter] = useState<'all' | 'cash' | 'upi' | 'card'>('all')
  const currentMonth = format(new Date(), 'MMMM yyyy')
  const filtered = filter === 'all' ? payments : payments.filter(p => p.payment_mode === filter)

  const modeConfig = {
    cash: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <Banknote className="w-4 h-4 text-emerald-600" /> },
    upi:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    icon: <Smartphone className="w-4 h-4 text-blue-600" /> },
    card: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  icon: <CreditCard className="w-4 h-4 text-purple-600" /> },
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Payments</h1>
        <span className="text-sm text-gray-400">{currentMonth}</span>
      </div>

      {/* Revenue summary — 1 col mobile, 3 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="card p-4 md:p-5 bg-gradient-to-br from-brand-500 to-brand-600">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-orange-100" />
            <p className="text-orange-100 text-xs font-semibold uppercase tracking-wide">Total Revenue</p>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-white">{formatCurrency(monthRevenue)}</p>
          <p className="text-orange-100 text-xs mt-1">{currentMonth}</p>
        </div>
        <div className="card p-4 md:p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
              <Banknote className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cash</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(cashRevenue)}</p>
        </div>
        <div className="card p-4 md:p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">UPI</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(upiRevenue)}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {(['all', 'cash', 'upi', 'card'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize ${
              filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500'
            }`}
          >
            {f === 'all' ? 'All' : f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Mobile: Cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-gray-400 text-sm">No payments recorded yet</div>
        ) : filtered.map((payment) => {
          const mode = payment.payment_mode as 'cash' | 'upi' | 'card'
          const { bg, text, border, icon } = modeConfig[mode]
          const admFee = payment.admission_fee ?? 0
          const total = payment.amount + admFee
          return (
            <div key={payment.id} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{payment.member?.name ?? 'Unknown'}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{payment.plan} · {formatDate(payment.start_date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900">{formatCurrency(total)}</p>
                {admFee > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {formatCurrency(payment.amount)} + {formatCurrency(admFee)} adm
                  </p>
                )}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border mt-0.5 inline-block ${bg} ${text} ${border}`}>
                  {mode.toUpperCase()}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: Table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Member</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Plan</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Period</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Mode</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">No payments recorded yet</td></tr>
            ) : filtered.map((payment) => {
              const mode = payment.payment_mode as 'cash' | 'upi' | 'card'
              const { bg, text, border, icon } = modeConfig[mode]
              const admFee = payment.admission_fee ?? 0
              const total = payment.amount + admFee
              return (
                <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-gray-900">{payment.member?.name ?? 'Unknown'}</td>
                  <td className="px-5 py-3.5 text-gray-500 capitalize">{payment.plan}</td>
                  <td className="px-5 py-3.5 text-gray-500">{formatDate(payment.start_date)} – {formatDate(payment.end_date)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${bg} ${text} ${border}`}>
                      {icon}{mode.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="font-bold text-gray-900">{formatCurrency(total)}</p>
                    {admFee > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        membership {formatCurrency(payment.amount)}, admission {formatCurrency(admFee)}
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
