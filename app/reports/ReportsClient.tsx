'use client'

import { BarChart2, TrendingUp, Users, XCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface MonthData {
  label: string
  total: number
  cash: number
  upi: number
  card: number
  transactions: number
  members: number
}

interface Props {
  months: MonthData[]
  expiredCount: number
  activeCount: number
}

export function ReportsClient({ months, expiredCount, activeCount }: Props) {
  const currentMonth = months[0]
  const maxRevenue = Math.max(...months.map(m => m.total), 1)

  return (
    <div>
      {/* Header */}
      <div className="bg-white px-4 pt-10 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">Monthly revenue overview</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Membership snapshot */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center mb-2">
              <Users className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
            <p className="text-xs text-gray-500">Active members</p>
          </div>
          <div className="card p-4">
            <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center mb-2">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{expiredCount}</p>
            <p className="text-xs text-gray-500">Expired members</p>
          </div>
        </div>

        {/* Revenue bar chart (CSS) */}
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-4">Revenue Trend</h2>
          <div className="space-y-3">
            {months.map((month, i) => (
              <div key={month.label}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-gray-600">{month.label}</span>
                  <span className="text-sm font-semibold text-gray-900">{formatCurrency(month.total)}</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all duration-500"
                    style={{ width: `${(month.total / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly breakdown */}
        {months.map((month, i) => (
          <div key={month.label} className="card">
            <div className={`p-4 border-b border-gray-50 flex items-center justify-between ${i === 0 ? 'bg-brand-50' : ''}`}>
              <div>
                <h3 className={`font-semibold ${i === 0 ? 'text-brand-800' : 'text-gray-900'}`}>
                  {month.label}
                  {i === 0 && <span className="ml-2 text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full">Current</span>}
                </h3>
                <p className="text-xs text-gray-500">{month.transactions} payments · {month.members} members</p>
              </div>
              <p className={`text-xl font-bold ${i === 0 ? 'text-brand-700' : 'text-gray-900'}`}>
                {formatCurrency(month.total)}
              </p>
            </div>
            <div className="p-4 grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">Cash</p>
                <p className="font-semibold text-gray-800 text-sm">{formatCurrency(month.cash)}</p>
              </div>
              <div className="text-center border-x border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">UPI</p>
                <p className="font-semibold text-gray-800 text-sm">{formatCurrency(month.upi)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">Card</p>
                <p className="font-semibold text-gray-800 text-sm">{formatCurrency(month.card)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
