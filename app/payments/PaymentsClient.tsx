'use client'

import { useState } from 'react'
import { CreditCard, TrendingUp, Banknote, Smartphone } from 'lucide-react'
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

  const filtered = filter === 'all'
    ? payments
    : payments.filter(p => p.payment_mode === filter)

  return (
    <div>
      {/* Header */}
      <div className="bg-white px-4 pt-10 pb-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">Payments</h1>
        </div>

        {/* This month summary */}
        <div className="bg-brand-50 rounded-2xl p-4 mb-3">
          <p className="text-xs text-brand-600 font-medium mb-1">{currentMonth}</p>
          <p className="text-2xl font-bold text-brand-800">{formatCurrency(monthRevenue)}</p>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-xs text-brand-700">Cash: {formatCurrency(cashRevenue)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Smartphone className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-xs text-brand-700">UPI: {formatCurrency(upiRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'cash', 'upi', 'card'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {f === 'all' ? 'All' : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">
            No payments recorded yet
          </div>
        ) : (
          filtered.map((payment) => (
            <div key={payment.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{payment.member?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1)} ·{' '}
                    {formatDate(payment.start_date)} – {formatDate(payment.end_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{formatCurrency(payment.amount)}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                    payment.payment_mode === 'cash'
                      ? 'bg-green-50 text-green-700'
                      : payment.payment_mode === 'upi'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-purple-50 text-purple-700'
                  }`}>
                    {payment.payment_mode.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
