'use client'

import { Users, XCircle, TrendingUp } from 'lucide-react'
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
  const maxRevenue = Math.max(...months.map(m => m.total), 1)

  return (
    <div className="space-y-4 md:space-y-5">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900">Reports</h1>

      {/* Summary cards — 1 col mobile, 3 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="card p-4 md:p-5">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center mb-2.5">
            <Users className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{activeCount}</p>
          <p className="text-sm text-gray-500 mt-1">Active members</p>
        </div>
        <div className="card p-4 md:p-5">
          <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center mb-2.5">
            <XCircle className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{expiredCount}</p>
          <p className="text-sm text-gray-500 mt-1">Expired members</p>
        </div>
        <div className="card p-4 md:p-5">
          <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center mb-2.5">
            <TrendingUp className="w-5 h-5 text-brand-600" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{formatCurrency(months[0]?.total ?? 0)}</p>
          <p className="text-sm text-gray-500 mt-1">This month's revenue</p>
        </div>
      </div>

      {/* Charts — stacked mobile, side-by-side desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        {/* Revenue bar chart */}
        <div className="card p-4 md:p-5">
          <h2 className="font-bold text-gray-900 mb-4">Revenue Trend</h2>
          <div className="space-y-3.5">
            {months.map((month, i) => (
              <div key={month.label}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className={`text-sm font-semibold ${i === 0 ? 'text-brand-600' : 'text-gray-600'}`}>{month.label}</span>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(month.total)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${i === 0 ? 'bg-gradient-to-r from-brand-400 to-brand-600' : 'bg-gray-300'}`}
                    style={{ width: `${(month.total / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly breakdown */}
        <div className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3.5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Monthly Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 md:px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Month</th>
                  <th className="text-right px-4 md:px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Cash</th>
                  <th className="text-right px-4 md:px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">UPI</th>
                  <th className="text-right px-4 md:px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {months.map((month, i) => (
                  <tr key={month.label} className={i === 0 ? 'bg-brand-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 md:px-5 py-3">
                      <p className={`font-semibold text-sm ${i === 0 ? 'text-brand-700' : 'text-gray-900'}`}>{month.label}</p>
                      <p className="text-xs text-gray-400">{month.transactions} payments</p>
                    </td>
                    <td className="px-4 md:px-5 py-3 text-right text-gray-600 text-sm">{formatCurrency(month.cash)}</td>
                    <td className="px-4 md:px-5 py-3 text-right text-gray-600 text-sm">{formatCurrency(month.upi)}</td>
                    <td className={`px-4 md:px-5 py-3 text-right font-bold text-sm ${i === 0 ? 'text-brand-700' : 'text-gray-900'}`}>{formatCurrency(month.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
