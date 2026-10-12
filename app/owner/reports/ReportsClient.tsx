'use client'

import { useState, type KeyboardEvent, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, Download, Dumbbell, IndianRupee, MessageCircle, Users } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { buildCustomWhatsAppLink, cn, formatDate } from '@/lib/utils'
import { tourAttr } from '@/lib/tours/anchors'
import type { ReportData } from './report-data'
import { monthChange, runRate, weekdayInsight } from './insights'
import { TOPICS, type Topic } from './topics'

// recharts is used only inside the answers that draw a chart, so it is loaded
// with them rather than with the page.
const chartFallback = () => <div className="h-full w-full skeleton rounded-xl" />
const CollectionsChart = dynamic(() => import('./ReportsCharts').then(m => m.CollectionsChart), { ssr: false, loading: chartFallback })
const WeekdayBars = dynamic(() => import('./ReportsCharts').then(m => m.WeekdayBars), { ssr: false, loading: chartFallback })
const JoinsChart = dynamic(() => import('./ReportsCharts').then(m => m.JoinsChart), { ssr: false, loading: chartFallback })

type MessageKind = 'dues' | 'renewal' | 'winback' | 'checkin'

interface Props {
  data: ReportData
  gymName: string
  /** The gym's calendar day (IST), "YYYY-MM-DD" — resolved on the server so every date on the page agrees with the query. */
  today: string
  /** From `?topic=`, so a refresh or a shared link opens the same answer. */
  initialTopic?: Topic
}

const inr = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`
const pct = (share: number) => `${Math.round(share * 100)}%`
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

const PLAN_NAMES: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', custom: 'Custom' }

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1'

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
    <section className={cn('card rounded-2xl p-4 md:p-5', className)}>
      <h2 className="font-extrabold text-slate-900 tracking-tight">{title}</h2>
      {hint && <p className="text-xs text-slate-500 font-medium mt-0.5">{hint}</p>}
      {children}
    </section>
  )
}

/** The answer to the question, in a sentence, before any detail. */
function Headline({ value, tone = 'text-slate-900', children }: { value: string; tone?: string; children?: ReactNode }) {
  return (
    <div className="card rounded-2xl p-4 md:p-5">
      <p className={cn('text-3xl md:text-4xl font-black tracking-tight tabular-nums', tone)}>{value}</p>
      {children && <p className="text-sm text-slate-600 font-medium mt-1.5 leading-relaxed">{children}</p>}
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

/** One name, one figure, one bar. Used for plans, areas and income sources. */
function ShareRow({ label, value, share, className }: { label: string; value: ReactNode; share: number; className: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-bold text-slate-800 truncate">{label}</span>
        <span className="font-black text-slate-900 flex-shrink-0 tabular-nums">{value}</span>
      </div>
      <Bar share={share} className={className} />
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
        {amount && <span className="text-sm font-black text-red-600 tabular-nums">{amount}</span>}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Message ${name} on WhatsApp`}
          className={cn('flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-colors', FOCUS)}
        >
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Message</span>
        </a>
      </div>
    </div>
  )
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 mt-4 rounded', FOCUS)}>
      {children} <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
    </Link>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-slate-400 font-semibold mt-3">{children}</p>
}

/** Secondary breakdowns, closed until asked for so the answer above stays short. */
function MoreDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="card rounded-2xl group">
      <summary className={cn('flex items-center justify-between gap-3 cursor-pointer list-none p-4 md:px-5 rounded-2xl text-sm font-extrabold text-slate-900', FOCUS)}>
        {title}
        <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4 md:px-5 md:pb-5 space-y-4">{children}</div>
    </details>
  )
}

export function ReportsClient({ data, gymName, today, initialTopic = 'members' }: Props) {
  const [topic, setTopic] = useState<Topic>(initialTopic)
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)

  // The URL follows the tab without a navigation, so a refresh keeps the answer
  // and the link can be shared, while switching stays instant.
  function open(id: Topic) {
    setTopic(id)
    const url = new URL(window.location.href)
    url.searchParams.set('topic', id)
    window.history.replaceState(null, '', url)
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = TOPICS[(index + step + TOPICS.length) % TOPICS.length]
    open(next)
    document.getElementById(`reports-tab-${next}`)?.focus()
  }

  const { members, dues, attendance, inactive, lapsed, expiring } = data
  const thisMonth = data.months[data.months.length - 1]
  const lastMonth = data.months[data.months.length - 2]
  const sixMonthTotal = data.months.reduce((total, m) => total + m.total, 0)
  const rate = runRate(data.months)
  const change = monthChange(data.months)
  const week = weekdayInsight(attendance)
  const modes = [
    { label: 'UPI', value: data.months.reduce((total, m) => total + m.upi, 0) },
    { label: 'Cash', value: data.months.reduce((total, m) => total + m.cash, 0) },
    { label: 'Card', value: data.months.reduce((total, m) => total + m.card, 0) },
  ].filter(mode => mode.value > 0)
  const daysLeft = (date: string) => differenceInCalendarDays(parseISO(date), parseISO(today))

  // The five questions an owner actually asks. `badge` is the count of people
  // waiting on the owner, so the tab says where to look before it is opened.
  const tabs: { id: Topic; icon: typeof Users; label: string; badge: number }[] = [
    { id: 'members', icon: Users, label: 'Members', badge: 0 },
    { id: 'money', icon: IndianRupee, label: 'Money', badge: 0 },
    { id: 'dues', icon: AlertTriangle, label: 'Dues', badge: dues.count },
    { id: 'leaving', icon: CalendarClock, label: 'Leaving', badge: members.expiring7 },
    { id: 'attendance', icon: Dumbbell, label: 'Attendance', badge: attendance.tracked ? inactive.count : 0 },
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
    <div className="space-y-4 md:space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">How {gymName} is doing, in plain words.</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <button
            {...tourAttr('reportsPdf')}
            onClick={exportPdf}
            disabled={exporting}
            className={cn('flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 bg-surface border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-95 transition-colors transition-transform disabled:opacity-60', FOCUS)}
          >
            <Download className="w-4 h-4 text-brand-500" aria-hidden="true" />
            <span className="hidden sm:inline">{exporting ? 'Preparing…' : 'Download PDF'}</span>
            <span className="sm:hidden">{exporting ? '…' : 'PDF'}</span>
          </button>
          <div aria-live="polite" role="status">
            {exportFailed && <p className="text-[11px] text-red-600 font-semibold mt-1.5 max-w-[11rem]">Could not create the PDF. Check your connection and try again.</p>}
          </div>
        </div>
      </div>

      {/* The five questions as tabs: the answer opens right underneath, never off-screen. */}
      <div
        {...tourAttr('reportsQuestions')}
        role="tablist"
        aria-label="Report topics"
        className="flex gap-1.5 overflow-x-auto no-scrollbar p-1 bg-slate-100 rounded-2xl"
      >
        {tabs.map((tab, index) => {
          const selected = topic === tab.id
          return (
            <button
              key={tab.id}
              id={`reports-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="reports-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => open(tab.id)}
              onKeyDown={e => onTabKey(e, index)}
              className={cn(
                'flex-1 min-w-fit flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-colors',
                selected ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                FOCUS
              )}
            >
              <tab.icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {tab.label}
              {tab.badge > 0 && (
                <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-50 text-red-600 text-[11px] font-black flex items-center justify-center tabular-nums">
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div id="reports-panel" role="tabpanel" aria-labelledby={`reports-tab-${topic}`} className="space-y-3 md:space-y-4">
        {topic === 'members' && (
          <>
            <Headline value={`${members.active} active of ${members.total}`} tone="text-slate-900">
              {thisMonth.newMembers} joined and {thisMonth.renewals} renewed this month.{' '}
              {members.expired > 0
                ? `${members.expired} ${plural(members.expired, 'member')} without a current plan.`
                : 'Everyone has a current plan.'}
            </Headline>
            <Panel title="New members and renewals" hint="Each month for the last six months">
              {data.months.some(m => m.newMembers + m.renewals > 0) ? (
                <>
                  <div className="h-52 mt-4" role="img" aria-label={`New members and renewals by month: ${data.months.map(m => `${m.label} ${m.newMembers} new, ${m.renewals} renewed`).join('; ')}`}>
                    <JoinsChart months={data.months} />
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 mt-3">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" /> New members</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Renewals</span>
                  </div>
                </>
              ) : <Empty>No one has joined or renewed in the last six months.</Empty>}
            </Panel>
            {(data.plans.length > 0 || data.areas.length > 0) && (
              <MoreDetails title="Plans and areas">
                {data.plans.length > 0 && (
                  <div className="space-y-3.5">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Plans of active members</h3>
                    {data.plans.map(plan => (
                      <ShareRow
                        key={plan.plan}
                        label={PLAN_NAMES[plan.plan] ?? plan.plan}
                        value={<>{plan.count} <span className="text-slate-400 font-semibold text-xs">({pct(plan.count / members.active)})</span></>}
                        share={plan.count / members.active}
                        className="bg-brand-500"
                      />
                    ))}
                  </div>
                )}
                {data.areas.length > 0 && (
                  <div className="space-y-3.5">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Where members come from</h3>
                    {data.areas.map(area => (
                      <ShareRow key={area.area} label={area.area} value={area.count} share={area.count / data.areas[0].count} className="bg-indigo-500" />
                    ))}
                  </div>
                )}
              </MoreDetails>
            )}
            <MoreLink href="/owner/members">Open the full member list</MoreLink>
          </>
        )}

        {topic === 'money' && (
          <>
            <Headline value={`${inr(thisMonth.total)} this month`} tone="text-emerald-600">
              From {thisMonth.transactions} {plural(thisMonth.transactions, 'payment')} so far.{' '}
              {change !== null && <>That is {pct(Math.abs(change))} {change >= 0 ? 'more' : 'less'} than all of {lastMonth.label} ({inr(lastMonth.total)}).{' '}</>}
              {rate ? `A usual month brings in about ${inr(rate.average)}.` : null}
            </Headline>
            <Panel title="Money collected each month" hint="Counted in the month it was paid. The dashed line is a usual month.">
              {sixMonthTotal > 0 ? (
                <>
                  <div className="h-56 mt-4" role="img" aria-label={`Money collected by month: ${data.months.map(m => `${m.label} ${inr(m.total)}`).join('; ')}`}>
                    <CollectionsChart months={data.months} average={rate?.average ?? null} />
                  </div>
                  {/* Values stay on the page: the chart tooltip needs a hover a phone does not have. */}
                  <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4">
                    {data.months.map(m => (
                      <div key={m.label} className="bg-slate-50 rounded-xl border border-slate-100 p-2 text-center">
                        <dt className="text-[11px] font-bold text-slate-500">{m.label.split(' ')[0]}</dt>
                        <dd className="text-xs font-black text-slate-900 tabular-nums">{inr(m.total)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : <Empty>No payments recorded in the last six months.</Empty>}
            </Panel>
            {thisMonth.total > 0 && (
              <Panel title="Where this month's money came from">
                <div className="space-y-3.5 mt-4">
                  <ShareRow label="Membership fees" value={inr(thisMonth.memberships)} share={thisMonth.memberships / thisMonth.total} className="bg-brand-500" />
                  <ShareRow label="Old dues collected" value={inr(thisMonth.dues)} share={thisMonth.dues / thisMonth.total} className="bg-amber-500" />
                  <ShareRow label="Product sales" value={inr(thisMonth.inventory)} share={thisMonth.inventory / thisMonth.total} className="bg-emerald-500" />
                </div>
                {modes.length > 0 && (
                  <p className="text-sm text-slate-600 font-medium mt-4 pt-4 border-t border-slate-100">
                    <span className="font-bold text-slate-900">How members paid</span> (last six months):{' '}
                    {modes.map(mode => `${mode.label} ${pct(mode.value / sixMonthTotal)}`).join(' · ')}
                  </p>
                )}
              </Panel>
            )}
            <MoreLink href="/owner/payments">Open every payment</MoreLink>
          </>
        )}

        {topic === 'dues' && (
          <>
            <Headline value={dues.count > 0 ? `${inr(dues.total)} pending` : 'Nobody owes you'} tone={dues.total > 0 ? 'text-red-600' : 'text-emerald-600'}>
              {dues.count > 0
                ? `${dues.count} ${plural(dues.count, 'member')} ${plural(dues.count, 'has', 'have')} not paid in full. Tap Message to remind them on WhatsApp.`
                : 'Every fee is paid.'}
            </Headline>
            {dues.top.length > 0 && (
              <Panel title="Who owes you" hint={dues.count > dues.top.length ? `The ${dues.top.length} largest of ${dues.count}` : 'Largest amount first'}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-4">
                  {dues.top.map(member => (
                    <PersonRow key={`${member.phone}-${member.name}`} name={member.name} note={member.phone} amount={inr(member.amount)} href={messageLink(gymName, member, 'dues', member.amount)} />
                  ))}
                </div>
                <MoreLink href="/owner/dues">Collect a payment on the Dues page</MoreLink>
              </Panel>
            )}
          </>
        )}

        {topic === 'leaving' && (
          <>
            <Headline value={`${members.expiring7} ${plural(members.expiring7, 'plan')} ending this week`} tone={members.expiring7 > 0 ? 'text-amber-600' : 'text-slate-900'}>
              {members.expiring30} in the next 30 days, worth {inr(members.renewal30)} if they all renew.{' '}
              {lapsed.count > 0 ? `${lapsed.count} ${plural(lapsed.count, 'member')} left in the last 30 days.` : 'Nobody has left in the last 30 days.'}
            </Headline>
            <Panel title="Ending soon" hint="Remind them before the plan runs out">
              {expiring.length === 0 ? <Empty>No plan ends in the next 30 days.</Empty> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-4">
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
              {members.expiring30 > expiring.length && <Note>Showing the {expiring.length} soonest of {members.expiring30}.</Note>}
              <MoreLink href="/owner/members?filter=expiring">See expiring members</MoreLink>
            </Panel>
            <Panel title="Just left" hint="Their plan ended in the last 30 days and they have not renewed">
              {lapsed.top.length === 0 ? <Empty>Nobody has left in the last 30 days.</Empty> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-4">
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
              {lapsed.count > lapsed.top.length && <Note>Showing the {lapsed.top.length} most recent of {lapsed.count}.</Note>}
              <MoreLink href="/owner/members?filter=expired">See expired members</MoreLink>
            </Panel>
          </>
        )}

        {topic === 'attendance' && (
          <>
            {!week ? (
              <Panel title="No check-ins yet">
                <Empty>No check-ins in the last 90 days. Mark attendance and this report will show your busy days and who has stopped coming.</Empty>
                <MoreLink href="/owner/attendance">Mark attendance</MoreLink>
              </Panel>
            ) : (
              <>
                <Headline value={`${attendance.today} checked in today`} tone="text-brand-600">
                  {week.busiest.name} is your busiest day and {week.quietest.name} the quietest. {pct(week.morningShare)} of check-ins are in the morning.
                </Headline>
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
                    {inactive.count > inactive.top.length && <Note>Showing the {inactive.top.length} who have been away longest, of {inactive.count}.</Note>}
                  </Panel>
                )}
                <Panel title="Busiest days" hint={`Check-ins by day of the week, last 90 days (${attendance.total.toLocaleString('en-IN')} in all)`}>
                  <div className="h-52 mt-4" role="img" aria-label={`Check-ins by weekday: ${attendance.byDay.map(d => `${d.name} ${d.count}`).join(', ')}`}>
                    <WeekdayBars byDay={attendance.byDay} />
                  </div>
                </Panel>
                <MoreLink href="/owner/attendance">Open the attendance log</MoreLink>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
