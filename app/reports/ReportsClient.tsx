'use client'

import { useState } from 'react'
import { Users, XCircle, TrendingUp, Download, UserCheck, BarChart2, MapPin, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'

interface MonthData {
  label: string
  total: number
  cash: number
  upi: number
  card: number
  transactions: number
  newMembers: number
}

interface Props {
  months: MonthData[]
  expiredCount: number
  activeCount: number
  totalMembers: number
  planCounts: { monthly: number; quarterly: number; annual: number }
  genderCounts: { male: number; female: number; other: number; unknown: number }
  ageBuckets: Record<string, number>
  newMembersByMonth: { label: string; count: number }[]
  churnCount: number
  attendanceByDay: { name: string; count: number }[]
  topAreas: { area: string; count: number }[]
  gymName: string
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className="card p-4 md:p-5">
      <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center mb-2.5`}>{icon}</div>
      <p className="text-2xl md:text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export function ReportsClient({
  months, expiredCount, activeCount, totalMembers,
  planCounts, genderCounts, ageBuckets,
  newMembersByMonth, churnCount, attendanceByDay, topAreas, gymName,
}: Props) {
  const maxRevenue    = Math.max(...months.map(m => m.total), 1)
  const maxNewMembers = Math.max(...newMembersByMonth.map(m => m.count), 1)
  const maxAttendance = Math.max(...attendanceByDay.map(d => d.count), 1)
  const maxArea       = Math.max(...topAreas.map(a => a.count), 1)
  const totalPlanCount = planCounts.monthly + planCounts.quarterly + planCounts.annual || 1
  const totalGender    = genderCounts.male + genderCounts.female + genderCounts.other + genderCounts.unknown || 1

  function exportPDF() {
    const fmt = (n: number) => `Rs.${n.toLocaleString('en-IN')}`
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Report — ${gymName}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px}
      h1{font-size:22px;font-weight:700;text-align:center}
      h2{font-size:15px;font-weight:700;margin:20px 0 10px}
      .sub{color:#555;text-align:center;margin-top:4px;margin-bottom:24px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
      .card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
      .card .val{font-size:22px;font-weight:700;margin-top:4px}
      .card .lbl{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      th{background:#f3f4f6;text-align:left;padding:7px 10px;font-size:11px;text-transform:uppercase;color:#555;border-bottom:2px solid #e5e7eb}
      td{padding:7px 10px;border-bottom:1px solid #f3f4f6}
      .footer{margin-top:32px;text-align:center;font-size:11px;color:#aaa}
    </style></head><body>
    <h1>${gymName}</h1>
    <p class="sub">Report generated on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}</p>
    <div class="grid">
      <div class="card"><div class="lbl">Total Members</div><div class="val">${totalMembers}</div></div>
      <div class="card"><div class="lbl">Active</div><div class="val">${activeCount}</div></div>
      <div class="card"><div class="lbl">Expired</div><div class="val">${expiredCount}</div></div>
    </div>
    <h2>Monthly Revenue (Last 6 Months)</h2>
    <table>
      <thead><tr><th>Month</th><th>Cash</th><th>UPI</th><th>Card</th><th>Transactions</th><th>Total</th></tr></thead>
      <tbody>${months.map(m => `<tr>
        <td>${m.label}</td><td>${fmt(m.cash)}</td><td>${fmt(m.upi)}</td><td>${fmt(m.card)}</td>
        <td>${m.transactions}</td><td><strong>${fmt(m.total)}</strong></td>
      </tr>`).join('')}</tbody>
    </table>
    <h2>Plan Distribution</h2>
    <table>
      <thead><tr><th>Plan</th><th>Members</th><th>%</th></tr></thead>
      <tbody>
        <tr><td>Monthly</td><td>${planCounts.monthly}</td><td>${Math.round(planCounts.monthly/totalPlanCount*100)}%</td></tr>
        <tr><td>Quarterly</td><td>${planCounts.quarterly}</td><td>${Math.round(planCounts.quarterly/totalPlanCount*100)}%</td></tr>
        <tr><td>Annual</td><td>${planCounts.annual}</td><td>${Math.round(planCounts.annual/totalPlanCount*100)}%</td></tr>
      </tbody>
    </table>
    <h2>Gender Breakdown</h2>
    <table>
      <thead><tr><th>Gender</th><th>Count</th><th>%</th></tr></thead>
      <tbody>
        <tr><td>Male</td><td>${genderCounts.male}</td><td>${Math.round(genderCounts.male/totalGender*100)}%</td></tr>
        <tr><td>Female</td><td>${genderCounts.female}</td><td>${Math.round(genderCounts.female/totalGender*100)}%</td></tr>
        <tr><td>Other</td><td>${genderCounts.other}</td><td>${Math.round(genderCounts.other/totalGender*100)}%</td></tr>
        <tr><td>Unknown</td><td>${genderCounts.unknown}</td><td>${Math.round(genderCounts.unknown/totalGender*100)}%</td></tr>
      </tbody>
    </table>
    <h2>Top Areas</h2>
    <table>
      <thead><tr><th>Area</th><th>Members</th></tr></thead>
      <tbody>${topAreas.map(a => `<tr><td>${a.area}</td><td>${a.count}</td></tr>`).join('')}</tbody>
    </table>
    <div class="footer">Generated by GymFlow</div>
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Reports</h1>
        <button onClick={exportPDF}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
          <Download className="w-4 h-4" />Export PDF
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users className="w-5 h-5 text-brand-600" />}    label="Total Members"  value={totalMembers}  color="bg-brand-50" />
        <StatCard icon={<UserCheck className="w-5 h-5 text-emerald-600" />} label="Active"       value={activeCount}   color="bg-emerald-50" />
        <StatCard icon={<XCircle className="w-5 h-5 text-red-500" />}    label="Expired"        value={expiredCount}  color="bg-red-50" />
        <StatCard icon={<TrendingUp className="w-5 h-5 text-brand-600" />} label="This Month"   value={formatCurrency(months[0]?.total ?? 0)} color="bg-brand-50" />
      </div>

      {/* Revenue trend + Monthly breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 md:p-5">
          <h2 className="font-bold text-gray-900 mb-4">Revenue Trend</h2>
          <div className="space-y-3.5">
            {[...months].reverse().map((month, i, arr) => (
              <div key={month.label}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className={`text-sm font-semibold ${i === arr.length - 1 ? 'text-brand-600' : 'text-gray-600'}`}>{month.label}</span>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(month.total)}</span>
                </div>
                <Bar value={month.total} max={maxRevenue}
                  color={i === arr.length - 1 ? 'bg-gradient-to-r from-brand-400 to-brand-600' : 'bg-gray-300'} />
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3.5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Monthly Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Month</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Cash</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">UPI</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {months.map((month, i) => (
                  <tr key={month.label} className={i === 0 ? 'bg-brand-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3">
                      <p className={`font-semibold text-sm ${i === 0 ? 'text-brand-700' : 'text-gray-900'}`}>{month.label}</p>
                      <p className="text-xs text-gray-400">{month.transactions} payments · {month.newMembers} new</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 text-sm">{formatCurrency(month.cash)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 text-sm">{formatCurrency(month.upi)}</td>
                    <td className={`px-4 py-3 text-right font-bold text-sm ${i === 0 ? 'text-brand-700' : 'text-gray-900'}`}>{formatCurrency(month.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Plan distribution + Gender breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 md:p-5">
          <h2 className="font-bold text-gray-900 mb-4">Plan Distribution</h2>
          <div className="space-y-3">
            {([
              { key: 'monthly',   label: 'Monthly',   color: 'bg-brand-400' },
              { key: 'quarterly', label: 'Quarterly', color: 'bg-emerald-400' },
              { key: 'annual',    label: 'Annual',    color: 'bg-purple-400' },
            ] as const).map(({ key, label, color }) => {
              const count = planCounts[key]
              const pct = Math.round((count / totalPlanCount) * 100)
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700">{label}</span>
                    <span className="font-bold text-gray-900">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <Bar value={count} max={totalPlanCount} color={color} />
                </div>
              )
            })}
          </div>
        </div>

        <div className="card p-4 md:p-5">
          <h2 className="font-bold text-gray-900 mb-4">Gender Breakdown</h2>
          <div className="space-y-3">
            {([
              { key: 'male',    label: 'Male',    color: 'bg-blue-400' },
              { key: 'female',  label: 'Female',  color: 'bg-pink-400' },
              { key: 'other',   label: 'Other',   color: 'bg-amber-400' },
              { key: 'unknown', label: 'Unknown', color: 'bg-gray-300' },
            ] as const).map(({ key, label, color }) => {
              const count = genderCounts[key]
              const pct = Math.round((count / totalGender) * 100)
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700">{label}</span>
                    <span className="font-bold text-gray-900">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <Bar value={count} max={totalGender} color={color} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Age breakdown + New members per month */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 md:p-5">
          <h2 className="font-bold text-gray-900 mb-4">Age Distribution</h2>
          <div className="space-y-3">
            {Object.entries(ageBuckets).map(([bucket, count]) => {
              const maxAge = Math.max(...Object.values(ageBuckets), 1)
              return (
                <div key={bucket}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700">{bucket === 'unknown' ? 'Not set' : bucket}</span>
                    <span className="font-bold text-gray-900">{count}</span>
                  </div>
                  <Bar value={count} max={maxAge} color={bucket === 'unknown' ? 'bg-gray-300' : 'bg-brand-400'} />
                </div>
              )
            })}
          </div>
        </div>

        <div className="card p-4 md:p-5">
          <h2 className="font-bold text-gray-900 mb-4">New Members per Month</h2>
          <div className="space-y-3">
            {[...newMembersByMonth].reverse().map((m, i, arr) => (
              <div key={m.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className={`font-medium ${i === arr.length - 1 ? 'text-brand-600' : 'text-gray-700'}`}>{m.label}</span>
                  <span className="font-bold text-gray-900">{m.count}</span>
                </div>
                <Bar value={m.count} max={maxNewMembers}
                  color={i === arr.length - 1 ? 'bg-gradient-to-r from-brand-400 to-brand-600' : 'bg-gray-300'} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peak attendance days + Area distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 md:p-5">
          <h2 className="font-bold text-gray-900 mb-1">Peak Attendance Days</h2>
          <p className="text-xs text-gray-400 mb-4">Last 3 months</p>
          <div className="flex items-end gap-2 h-24">
            {attendanceByDay.map((d, i) => (
              <div key={d.name} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs font-bold text-gray-700">{d.count}</span>
                <div className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max((d.count / maxAttendance) * 56, d.count > 0 ? 4 : 0)}px`,
                    background: d.count === Math.max(...attendanceByDay.map(x => x.count))
                      ? 'linear-gradient(to top, #f97316, #fb923c)'
                      : '#e5e7eb'
                  }}
                />
                <span className="text-[10px] text-gray-400">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4 md:p-5">
          <h2 className="font-bold text-gray-900 mb-4">Top Areas</h2>
          {topAreas.length === 0 ? (
            <p className="text-sm text-gray-400">No area data available</p>
          ) : (
            <div className="space-y-3">
              {topAreas.map(({ area, count }) => (
                <div key={area}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700 truncate">{area}</span>
                    <span className="font-bold text-gray-900 ml-2 flex-shrink-0">{count}</span>
                  </div>
                  <Bar value={count} max={maxArea} color="bg-emerald-400" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Churn stat */}
      <div className="card p-4 flex items-center gap-4">
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <XCircle className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <p className="font-bold text-gray-900">Churn — {churnCount} expired members</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Members whose membership has expired and not yet renewed.
            {totalMembers > 0 && ` That's ${Math.round((churnCount / totalMembers) * 100)}% of total members.`}
          </p>
        </div>
      </div>
    </div>
  )
}
