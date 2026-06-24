import { format } from 'date-fns'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

interface PaymentRow {
  memberName: string
  memberNumber: number
  plan: string
  category?: string
  amount: number
  admission_fee: number
  payment_mode: string
}

interface NewMemberRow {
  name: string
  memberNumber: number
  phone: string
  area: string
  gender: string
}

interface DailyReportData {
  gymName: string
  date: string
  payments: PaymentRow[]
  newMembers: NewMemberRow[]
}

const formatCategory = (cat?: string) => {
  if (cat === 'both') return 'Strength + Cardio'
  if (cat === 'strength') return 'Strength'
  if (cat === 'cardio') return 'Cardio'
  return '-'
}

export function generateDailyReportPDF(data: DailyReportData) {
  const { gymName, date, payments, newMembers } = data
  const totalCash = payments.filter(p => p.payment_mode === 'cash').reduce((s, p) => s + p.amount + p.admission_fee, 0)
  const totalUPI  = payments.filter(p => p.payment_mode === 'upi').reduce((s, p) => s + p.amount + p.admission_fee, 0)
  const totalCard = payments.filter(p => p.payment_mode === 'card').reduce((s, p) => s + p.amount + p.admission_fee, 0)
  const grandTotal = totalCash + totalUPI + totalCard

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`
  const displayDate = format(new Date(date), 'dd MMMM yyyy')

  const rows = payments.map((p, i) => `
    <tr class="${i % 2 === 0 ? 'bg-gray-50' : ''}">
      <td class="text-gray-500 font-medium">#${p.memberNumber}</td>
      <td class="font-semibold text-gray-900">${escapeHtml(p.memberName)}</td>
      <td>
        <div class="capitalize text-gray-900 font-medium">${p.plan}</div>
        <div class="text-[10px] text-gray-500 mt-0.5">${formatCategory(p.category)}</div>
      </td>
      <td>
        <span class="badge ${p.payment_mode === 'upi' ? 'badge-blue' : p.payment_mode === 'cash' ? 'badge-green' : 'badge-purple'}">
          ${p.payment_mode.toUpperCase()}
        </span>
      </td>
      <td class="text-right text-gray-600">${fmt(p.amount)}</td>
      <td class="text-right text-gray-600">${p.admission_fee > 0 ? fmt(p.admission_fee) : '<span class="text-gray-300">—</span>'}</td>
      <td class="text-right font-bold text-gray-900">${fmt(p.amount + p.admission_fee)}</td>
    </tr>
  `).join('')

  const newMembersRows = newMembers.map((m, i) => `
    <tr class="${i % 2 === 0 ? 'bg-gray-50' : ''}">
      <td class="text-gray-500 font-medium">#${m.memberNumber}</td>
      <td class="font-semibold text-gray-900">${escapeHtml(m.name)}</td>
      <td class="text-gray-600">${escapeHtml(m.phone)}</td>
      <td class="text-gray-600 capitalize">${escapeHtml(m.gender)}</td>
      <td class="text-gray-600">${escapeHtml(m.area)}</td>
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Daily Report - ${displayDate}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; font-size: 13px; color: #374151; padding: 40px; background: #fff; line-height: 1.5; }
        
        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #f3f4f6; }
        .header-left h1 { font-size: 28px; font-weight: 800; color: #111827; letter-spacing: -0.02em; }
        .header-left p { color: #6b7280; font-size: 14px; margin-top: 4px; }
        .header-right { text-align: right; }
        .header-right .report-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; font-weight: 600; }
        .header-right .report-date { font-size: 16px; font-weight: 600; color: #111827; margin-top: 4px; }
        
        h2.section-title { font-size: 18px; font-weight: 700; color: #111827; margin-top: 40px; margin-bottom: 16px; }
        h2.section-title:first-of-type { margin-top: 0; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { background: #f9fafb; text-align: left; padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; font-weight: 600; }
        td { padding: 14px 16px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        
        .bg-gray-50 { background-color: #f9fafb; }
        .text-gray-900 { color: #111827; }
        .text-gray-600 { color: #4b5563; }
        .text-gray-500 { color: #6b7280; }
        .text-gray-300 { color: #d1d5db; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .font-medium { font-weight: 500; }
        .text-right { text-align: right; }
        .capitalize { text-transform: capitalize; }
        .text-\\[10px\\] { font-size: 10px; }
        .mt-0\\.5 { margin-top: 2px; }
        
        .badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }
        .badge-blue { background: #eff6ff; color: #2563eb; }
        .badge-green { background: #f0fdf4; color: #16a34a; }
        .badge-purple { background: #faf5ff; color: #9333ea; }
        
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 24px; }
        .summary-box { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .summary-box .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .summary-box .value { font-size: 20px; font-weight: 800; color: #111827; margin-top: 6px; }
        
        .total-box { background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-color: transparent; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2); }
        .total-box .label { color: #d1fae5; }
        .total-box .value { color: #ffffff; }
        
        .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #9ca3af; padding-top: 24px; border-top: 1px solid #f3f4f6; }
        
        @media print { 
          body { padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
          .summary-box { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <h1>${escapeHtml(gymName)}</h1>
          <p>Daily Report</p>
        </div>
        <div class="header-right">
          <div class="report-title">Date</div>
          <div class="report-date">${displayDate}</div>
        </div>
      </div>

      <h2 class="section-title">Payments Collected Today</h2>
      ${payments.length === 0
        ? '<div style="text-align:center; padding: 60px 20px; background: #f9fafb; border-radius: 12px; border: 1px dashed #d1d5db; color: #6b7280;">No payments collected today.</div>'
        : `<table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Member</th>
                <th>Plan Details</th>
                <th>Payment Mode</th>
                <th style="text-align:right">Membership Fee</th>
                <th style="text-align:right">Admission Fee</th>
                <th style="text-align:right">Total Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>`
      }

      <div class="summary">
        <div class="summary-box">
          <div class="label">Cash Total</div>
          <div class="value">${fmt(totalCash)}</div>
        </div>
        <div class="summary-box">
          <div class="label">UPI Total</div>
          <div class="value">${fmt(totalUPI)}</div>
        </div>
        <div class="summary-box">
          <div class="label">Card Total</div>
          <div class="value">${fmt(totalCard)}</div>
        </div>
        <div class="summary-box total-box">
          <div class="label">Grand Total</div>
          <div class="value">${fmt(grandTotal)}</div>
        </div>
      </div>

      <h2 class="section-title">New Members Joined Today</h2>
      ${newMembers.length === 0
        ? '<div style="text-align:center; padding: 60px 20px; background: #f9fafb; border-radius: 12px; border: 1px dashed #d1d5db; color: #6b7280;">No new members joined today.</div>'
        : `<table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Gender</th>
                <th>Area</th>
              </tr>
            </thead>
            <tbody>${newMembersRows}</tbody>
          </table>`
      }

      <div class="footer">
        Generated securely by GymFlow on ${format(new Date(), 'dd MMMM yyyy, hh:mm a')}
      </div>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 800)
}
