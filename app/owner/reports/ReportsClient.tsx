'use client'

import { useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, ChevronRight, Download, Dumbbell, IndianRupee, MessageCircle, Users } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { buildCustomWhatsAppLink, cn, formatDate } from '@/lib/utils'
import { tourAttr } from '@/lib/tours/anchors'
import type { ReportData } from './report-data'
import { monthChange, runRate, weekdayInsight } from './insights'

// recharts is used only inside the answers that draw a chart, so it is loaded
// with them rather than with the page.
const chartFallback = () => <div className="h-full w-full skeleton rounded-xl" />
const CollectionsChart = dynamic(() => import('./ReportsCharts').then(m => m.CollectionsChart), { ssr: false, loading: chartFallback })
const PaymentModeDonut = dynamic(() => import('./ReportsCharts').then(m => m.PaymentModeDonut), { ssr: false, loading: chartFallback })
const WeekdayBars = dynamic(() => import('./ReportsCharts').then(m => m.WeekdayBars), { ssr: false, loading: chartFallback })
const JoinsChart = dynamic(() => import('./ReportsCharts').then(m => m.JoinsChart), { ssr: false, loading: chartFallback })

interface Props {
  data: ReportData
  gymName: string
  /** The gym's calendar day (IST), "YYYY-MM-DD" — resolved on the server so every date on the page agrees with the query. */
  today: string
}

type Topic = 'members' | 'money' | 'dues' | 'leaving' | 'attendance'
type MessageKind = 'dues' | 'renewal' | 'winback' | 'checkin'

const inr = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`
const pct = (share: number) => `${Math.round(share * 100)}%`
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

const PLAN_NAMES: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', custom: 'Custom' }

function messageLink(gymName: string, member: { name: string; phone: string }, kind: MessageKind, detail?: string | number | null) {
  const text =
    kind === 'dues' ? `Hi ${member.name}, this is a reminder from ${gymName} about your pending dues of ₹${Number(detail).toLocaleString('en-IN')}. Please clear it at the desk on your next visit. Thank you!`
    : kind === 'renewal' ? `Hi ${member.name}, your membership at ${gymName} ends on ${formatDate(String(detail))}. Renew before then to keep your workouts going without a break!`
    : kind === 'winback' ? `Hi ${member.name}, your membership at ${gymName} ended on ${formatDate(String(detail))}. We would love to have you back — reply here to renew.`
    : `Hi ${member.name}, we have missed you at ${gymName}! We would love to see you back this week.`
  return buildCustomWhatsAppLink(member.phone, text)
}

function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('card rounded-2xl p-4 md:p-6', className)}>
      <h3 className="font-extrabold text-slate-900 tracking-tight">{title}</h3>
      {hint && <p className="text-xs text-slate-500 font-medium mt-0.5">{hint}</p>}
      {children}
    </div>
  )
}

function Stat({ label, value, note, tone = 'text-slate-900' }: { label: string; value: string | number; note?: string; tone?: string }) {
  return (
    <div className="card rounded-2xl p-4">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={cn('text-2xl font-black tracking-tight mt-1', tone)}>{value}</p>
      {note && <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{note}</p>}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400 font-medium text-center py-8 px-4">{children}</p>
}

function Bar({ share, className }: { share: number; className: string }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full', className)} style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
    </div>
  )
}

/** One person, what is true about them, and a WhatsApp message that fits. */
function PersonRow({ name, note, amount, href }: { name: string; note: string; amount?: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
        <p className="text-[11px] text-slate-500 font-medium">{note}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {amount && <span className="text-sm font-black text-red-600">{amount}</span>}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Message ${name} on WhatsApp`}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Message</span>
        </a>
      </div>
    </div>
  )
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 mt-4">
      {children} <ChevronRight className="w-3.5 h-3.5" />
    </Link>
  )
}

export function ReportsClient({ data, gymName, today }: Props) {
  const [topic, setTopic] = useState<Topic>('members')
  const answer = useRef<HTMLDivElement>(null)

  // On a phone the five questions fill the screen, so the answer would open out
  // of sight below them; bring it up when it is not already visible.
  function open(id: Topic) {
    setTopic(id)
    requestAnimationFrame(() => {
      const top = answer.current?.getBoundingClientRect().top ?? 0
      if (top > window.innerHeight * 0.6) answer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)

  const { members, dues, attendance, inactive, lapsed, expiring } = data
  const thisMonth = data.months[data.months.length - 1]
  const lastMonth = data.months[data.months.length - 2]
  const sixMonthTotal = data.months.reduce((total, m) => total + m.total, 0)
  const rate = runRate(data.months)
  const change = monthChange(data.months)
  const week = weekdayInsight(attendance)
  const modes = {
    upi: data.months.reduce((total, m) => total + m.upi, 0),
    cash: data.months.reduce((total, m) => total + m.cash, 0),
    card: data.months.reduce((total, m) => total + m.card, 0),
  }
  const daysLeft = (date: string) => differenceInCalendarDays(parseISO(date), parseISO(today))

  // The five questions an owner actually asks, each with its answer in one line.
  const questions: { id: Topic; icon: typeof Users; tint: string; question: string; answer: string }[] = [
    { id: 'members', icon: Users, tint: 'bg-brand-50 text-brand-600', question: 'Who are my members?', answer: `${members.active} active of ${members.total}` },
    { id: 'money', icon: IndianRupee, tint: 'bg-emerald-50 text-emerald-600', question: 'How much money did I make?', answer: `${inr(thisMonth.total)} this month` },
    { id: 'dues', icon: AlertTriangle, tint: 'bg-red-50 text-red-600', question: 'Who owes me money?', answer: dues.count > 0 ? `${inr(dues.total)} from ${dues.count} ${plural(dues.count, 'member')}` : 'Nobody owes you' },
    { id: 'leaving', icon: CalendarClock, tint: 'bg-amber-50 text-amber-600', question: 'Who is leaving?', answer: `${members.expiring7} ending this week · ${lapsed.count} just left` },
    { id: 'attendance', icon: Dumbbell, tint: 'bg-violet-50 text-violet-600', question: 'Are people actually coming?', answer: attendance.total > 0 ? `${attendance.today} checked in today` : 'No check-ins marked yet' },
  ]

  async function exportPdf() {
    setExporting(true)
    setExportFailed(false)
    try {
      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const doc = new JsPDF()
      // jsPDF's built-in fonts have no ₹ glyph, so the PDF writes "Rs."
      const rs = (amount: number) => `Rs. ${Math.round(amount).toLocaleString('en-IN')}`
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(20)
      doc.text(`${gymName} - Report`, 14, 20)
      doc.setFontSize(11)
      const lines = [
        `Generated: ${format(new Date(), 'dd MMMM yyyy, h:mm a')}`,
        `Members: ${members.active} active of ${members.total}`,
        `Collected in ${thisMonth.label} so far: ${rs(thisMonth.total)}    ${lastMonth.label}: ${rs(lastMonth.total)}`,
        `Pending dues: ${rs(dues.total)} from ${dues.count} ${plural(dues.count, 'member')}`,
        `Plans ending within 7 days: ${members.expiring7}    within 30 days: ${members.expiring30}`,
        `Ended in the last 30 days and not renewed: ${lapsed.count}`,
        `Check-ins today: ${attendance.today}`,
      ]
      lines.forEach((line, i) => doc.text(line, 14, 30 + i * 7))
      if (dues.top.length > 0) {
        const startY = 30 + lines.length * 7 + 6
        doc.text(dues.count > dues.top.length ? `Largest dues (${dues.top.length} of ${dues.count})` : 'Pending dues', 14, startY)
        autoTable(doc, {
          startY: startY + 4,
          head: [['#', 'Name', 'Phone', 'Pending amount']],
          body: dues.top.map((member, i) => [i + 1, member.name, member.phone, rs(member.amount)]),
        })
      }
      doc.save(`gymflow-report-${today}.pdf`)
    } catch {
      // The PDF libraries are fetched on demand, so a dropped connection lands here.
      setExportFailed(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Five questions about {gymName}, answered from your records.</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <button
            {...tourAttr('reportsPdf')}
            onClick={exportPdf}
            disabled={exporting}
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-surface border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60"
          >
            <Download className="w-4 h-4 text-brand-500" />
            {exporting ? 'Preparing…' : 'PDF'}
          </button>
          {exportFailed && <p className="text-[11px] text-red-600 font-semibold mt-1.5 max-w-[11rem]">Could not create the PDF. Check your connection and try again.</p>}
        </div>
      </div>

      {/* The five questions. Tapping one shows its details below. */}
      <div {...tourAttr('reportsQuestions')} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 md:gap-3">
        {questions.map(q => {
          const selected = topic === q.id
          return (
            <button
              key={q.id}
              onClick={() => open(q.id)}
              aria-pressed={selected}
              className={cn(
                'card rounded-2xl p-3.5 md:p-4 text-left flex lg:flex-col items-center lg:items-start gap-3 transition-all active:scale-[0.99]',
                selected ? 'border-brand-500 ring-2 ring-brand-200' : 'hover:bg-slate-50'
              )}
            >
              <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', q.tint)}><q.icon className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-500 leading-snug">{q.question}</span>
                <span className="block text-sm md:text-base font-black text-slate-900 tracking-tight mt-0.5">{q.answer}</span>
              </span>
              <ChevronRight className={cn('w-4 h-4 flex-shrink-0 lg:hidden', selected ? 'text-brand-500' : 'text-slate-300')} />
            </button>
          )
        })}
      </div>

      <div ref={answer} className="scroll-mt-4" />

      {topic === 'members' && (
        <section className="space-y-3 md:space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
            <Stat label="All members" value={members.total} />
            <Stat label="Active" value={members.active} note="Plan is current" tone="text-emerald-600" />
            <Stat label="Not active" value={members.expired} note="Plan ended or never bought" tone={members.expired > 0 ? 'text-red-600' : 'text-slate-900'} />
            <Stat label="Joined this month" value={thisMonth.newMembers} note={`${thisMonth.renewals} renewed`} tone="text-brand-600" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <Panel title="New members and renewals" hint="Each month for the last six months" className="lg:col-span-2">
              {data.months.some(m => m.newMembers + m.renewals > 0) ? (
                <>
                  <div className="h-56 mt-4"><JoinsChart months={data.months} /></div>
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 mt-3">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" /> New members</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Renewals</span>
                  </div>
                </>
              ) : <Empty>No one has joined or renewed in the last six months.</Empty>}
            </Panel>
            <Panel title="Plans" hint="What your active members are on">
              {data.plans.length === 0 ? <Empty>No active members yet.</Empty> : (
                <div className="space-y-3.5 mt-4">
                  {data.plans.map(plan => (
                    <div key={plan.plan} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-bold text-slate-800">{PLAN_NAMES[plan.plan] ?? plan.plan}</span>
                        <span className="font-black text-slate-900">{plan.count} <span className="text-slate-400 font-semibold text-xs">({pct(plan.count / members.active)})</span></span>
                      </div>
                      <Bar share={plan.count / members.active} className="bg-brand-500" />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
          {data.areas.length > 0 && (
            <Panel title="Where members come from" hint="By the area on their profile">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3.5 mt-4">
                {data.areas.map(area => (
                  <div key={area.area} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-800 truncate">{area.area}</span>
                      <span className="font-black text-slate-900 flex-shrink-0">{area.count}</span>
                    </div>
                    <Bar share={area.count / data.areas[0].count} className="bg-indigo-500" />
                  </div>
                ))}
              </div>
            </Panel>
          )}
          <MoreLink href="/owner/members">Open the full member list</MoreLink>
        </section>
      )}

      {topic === 'money' && (
        <section className="space-y-3 md:space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
            <Stat label="This month so far" value={inr(thisMonth.total)} note={`${thisMonth.transactions} ${plural(thisMonth.transactions, 'payment')}`} tone="text-emerald-600" />
            <Stat label="Last month" value={inr(lastMonth.total)} note={lastMonth.label} />
            <Stat
              label="Compared with last month"
              value={change === null ? '—' : `${change >= 0 ? '+' : ''}${pct(change)}`}
              note={change === null ? 'Nothing collected last month' : 'The month is not over yet'}
              tone={change === null ? 'text-slate-900' : change >= 0 ? 'text-emerald-600' : 'text-red-600'}
            />
            <Stat label="A usual month" value={rate ? inr(rate.average) : '—'} note={rate ? `Average of the last ${rate.basis} full months` : 'Needs two full months'} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <Panel title="Money collected each month" hint="Counted in the month it was paid" className="lg:col-span-2">
              {sixMonthTotal > 0
                ? <div className="h-60 mt-4"><CollectionsChart months={data.months} average={rate?.average ?? null} /></div>
                : <Empty>No payments recorded in the last six months.</Empty>}
            </Panel>
            <Panel title="Where this month's money came from">
              <div className="space-y-3.5 mt-4">
                {([['Membership fees', thisMonth.memberships, 'bg-brand-500'], ['Old dues collected', thisMonth.dues, 'bg-amber-500'], ['Product sales', thisMonth.inventory, 'bg-emerald-500']] as const).map(([label, value, colour]) => (
                  <div key={label} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-800">{label}</span>
                      <span className="font-black text-slate-900">{inr(value)}</span>
                    </div>
                    <Bar share={thisMonth.total > 0 ? value / thisMonth.total : 0} className={colour} />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <Panel title="How members paid" hint="Last six months">
            {sixMonthTotal > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center mt-2">
                <div className="h-52"><PaymentModeDonut {...modes} /></div>
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  {([['UPI', modes.upi, 'text-blue-600'], ['Cash', modes.cash, 'text-emerald-600'], ['Card', modes.card, 'text-purple-600']] as const).map(([label, value, colour]) => (
                    <div key={label} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className={cn('text-xs font-bold block', colour)}>{label}</span>
                      <span className="text-sm font-black text-slate-800 block mt-0.5">{inr(value)}</span>
                      <span className="text-[11px] text-slate-400 font-semibold">{pct(value / sixMonthTotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <Empty>Nothing collected yet.</Empty>}
          </Panel>
          <MoreLink href="/owner/payments">Open every payment</MoreLink>
        </section>
      )}

      {topic === 'dues' && (
        <section className="space-y-3 md:space-y-4">
          <div className="grid grid-cols-2 gap-2.5 md:gap-3">
            <Stat label="Total pending" value={inr(dues.total)} tone={dues.total > 0 ? 'text-red-600' : 'text-emerald-600'} />
            <Stat label="Members who owe" value={dues.count} />
          </div>
          <Panel title="Who owes you" hint={dues.count > dues.top.length ? `The ${dues.top.length} largest of ${dues.count}` : 'Largest amount first'}>
            {dues.top.length === 0 ? <Empty>Nobody owes you money. Every fee is paid.</Empty> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-4">
                {dues.top.map(member => (
                  <PersonRow key={`${member.phone}-${member.name}`} name={member.name} note={member.phone} amount={inr(member.amount)} href={messageLink(gymName, member, 'dues', member.amount)} />
                ))}
              </div>
            )}
            {dues.count > 0 && <MoreLink href="/owner/dues">Collect a payment on the Dues page</MoreLink>}
          </Panel>
        </section>
      )}

      {topic === 'leaving' && (
        <section className="space-y-3 md:space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
            <Stat label="Ending in 7 days" value={members.expiring7} note={`${inr(members.renewal7)} in renewals`} tone={members.expiring7 > 0 ? 'text-amber-600' : 'text-slate-900'} />
            <Stat label="Ending in 30 days" value={members.expiring30} note={`${inr(members.renewal30)} in renewals`} />
            <Stat label="Just left" value={lapsed.count} note="Ended in the last 30 days, not renewed" tone={lapsed.count > 0 ? 'text-red-600' : 'text-slate-900'} />
            <Stat label="All without a plan" value={members.expired} note="Ended any time, or never bought" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            <Panel title="Ending soon" hint="Remind them before the plan runs out">
              {expiring.length === 0 ? <Empty>No plan ends in the next 30 days.</Empty> : (
                <div className="space-y-2.5 mt-4">
                  {expiring.map(member => {
                    const days = daysLeft(member.endDate)
                    return (
                      <PersonRow
                        key={`${member.phone}-${member.name}`}
                        name={member.name}
                        note={`${PLAN_NAMES[member.plan] ?? member.plan} · ${days === 0 ? 'ends today' : `ends in ${days} ${plural(days, 'day')}`} (${formatDate(member.endDate)})`}
                        href={messageLink(gymName, member, 'renewal', member.endDate)}
                      />
                    )
                  })}
                </div>
              )}
              {members.expiring30 > expiring.length && <p className="text-[11px] text-slate-400 font-semibold mt-3">Showing the {expiring.length} soonest of {members.expiring30}.</p>}
              <MoreLink href="/owner/members?filter=expiring">See expiring members</MoreLink>
            </Panel>
            <Panel title="Just left" hint="Their plan ended in the last 30 days and they have not renewed">
              {lapsed.top.length === 0 ? <Empty>Nobody has left in the last 30 days.</Empty> : (
                <div className="space-y-2.5 mt-4">
                  {lapsed.top.map(member => (
                    <PersonRow
                      key={`${member.phone}-${member.name}`}
                      name={member.name}
                      note={`${PLAN_NAMES[member.plan] ?? member.plan} · ended ${formatDate(member.endDate)}`}
                      href={messageLink(gymName, member, 'winback', member.endDate)}
                    />
                  ))}
                </div>
              )}
              {lapsed.count > lapsed.top.length && <p className="text-[11px] text-slate-400 font-semibold mt-3">Showing the {lapsed.top.length} most recent of {lapsed.count}.</p>}
              <MoreLink href="/owner/members?filter=expired">See expired members</MoreLink>
            </Panel>
          </div>
        </section>
      )}

      {topic === 'attendance' && (
        <section className="space-y-3 md:space-y-4">
          {!week ? (
            <Panel title="No check-ins yet">
              <Empty>No check-ins in the last 90 days. Mark attendance and this report will show your busy days and who has stopped coming.</Empty>
              <MoreLink href="/owner/attendance">Mark attendance</MoreLink>
            </Panel>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
                <Stat label="Checked in today" value={attendance.today} tone="text-brand-600" />
                <Stat label="Last 90 days" value={attendance.total.toLocaleString('en-IN')} note="Check-ins" />
                <Stat label="Morning" value={pct(week.morningShare)} note={`${attendance.morning.toLocaleString('en-IN')} check-ins`} />
                <Stat label="Evening" value={pct(1 - week.morningShare)} note={`${attendance.evening.toLocaleString('en-IN')} check-ins`} />
              </div>
              <Panel title="Busiest days" hint="Check-ins by day of the week, last 90 days">
                <div className="h-56 mt-4"><WeekdayBars byDay={attendance.byDay} /></div>
                <p className="text-sm text-slate-600 font-medium mt-4">
                  <span className="font-bold text-slate-900">{week.busiest.name}</span> is your busiest day ({week.busiest.count} check-ins) and{' '}
                  <span className="font-bold text-slate-900">{week.quietest.name}</span> the quietest ({week.quietest.count}).
                </p>
              </Panel>
              {attendance.tracked && (
                <Panel
                  title={`Not coming: ${inactive.count} ${plural(inactive.count, 'member')}`}
                  hint="They have a current plan but have not checked in for 7 days or more. Members who joined this week are left out."
                >
                  {inactive.top.length === 0 ? <Empty>Every active member has checked in during the last 7 days.</Empty> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-4">
                      {inactive.top.map(member => (
                        <PersonRow
                          key={`${member.phone}-${member.name}`}
                          name={member.name}
                          note={member.lastVisit ? `Last came ${formatDate(member.lastVisit)} · ${-daysLeft(member.lastVisit)} days ago` : 'Has not come in the last 90 days'}
                          href={messageLink(gymName, member, 'checkin')}
                        />
                      ))}
                    </div>
                  )}
                  {inactive.count > inactive.top.length && <p className="text-[11px] text-slate-400 font-semibold mt-3">Showing the {inactive.top.length} who have been away longest, of {inactive.count}.</p>}
                </Panel>
              )}
              <MoreLink href="/owner/attendance">Open the attendance log</MoreLink>
            </>
          )}
        </section>
      )}
    </div>
  )
}
