'use client'

import { useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AlertCircle, ArrowRight, BarChart2, CheckCircle2, ChevronRight, Clock, Download, Flame,
  IndianRupee, Layers, MapPin, MessageCircle, Package, PieChart, ShieldAlert, Sparkles, Users,
} from 'lucide-react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { buildCustomWhatsAppLink, cn, formatDate } from '@/lib/utils'
import type { ReportData } from './report-data'
import {
  atRiskMembers, collectionRate, healthScore, recommendations, runRate, templateLabel, weekdayInsight,
  type HealthStatus, type Recommendation, type RiskKind,
} from './insights'

// recharts is used only by this page's chart tabs, so it is loaded with them
// rather than with the Overview tab an owner lands on.
const chartFallback = () => <div className="h-full w-full skeleton rounded-xl" />
const CollectionsChart = dynamic(() => import('./ReportsCharts').then(m => m.CollectionsChart), { ssr: false, loading: chartFallback })
const PaymentModeDonut = dynamic(() => import('./ReportsCharts').then(m => m.PaymentModeDonut), { ssr: false, loading: chartFallback })
const WeekdayBars = dynamic(() => import('./ReportsCharts').then(m => m.WeekdayBars), { ssr: false, loading: chartFallback })
const InventoryChart = dynamic(() => import('./ReportsCharts').then(m => m.InventoryChart), { ssr: false, loading: chartFallback })

interface Props {
  data: ReportData
  gymName: string
  /** The gym's calendar day (IST), "YYYY-MM-DD" — resolved on the server so every date on the page agrees with the query. */
  today: string
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'inventory', label: 'Inventory' },
] as const
type Tab = (typeof TABS)[number]['id']

const inr = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`
const pct = (share: number) => `${Math.round(share * 100)}%`
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

const PLAN_NAMES: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', custom: 'Custom' }
const PLAN_COLOURS: Record<string, string> = { monthly: 'text-blue-600', quarterly: 'text-emerald-600', annual: 'text-purple-600', custom: 'text-amber-600' }
const MODE_NAMES: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' }

const STATUS_PILL: Record<HealthStatus, string> = {
  Excellent: 'bg-blue-50 border-blue-100 text-blue-800',
  Healthy: 'bg-emerald-50 border-emerald-100 text-emerald-800',
  Warning: 'bg-amber-50 border-amber-100 text-amber-800',
  Critical: 'bg-red-50 border-red-100 text-red-800',
}

const TONES = {
  red: { edge: 'border-l-red-500', tile: 'bg-red-50', icon: 'text-red-500', word: 'text-red-600' },
  amber: { edge: 'border-l-amber-500', tile: 'bg-amber-50', icon: 'text-amber-500', word: 'text-amber-600' },
  brand: { edge: 'border-l-brand-500', tile: 'bg-brand-50', icon: 'text-brand-500', word: 'text-brand-600' },
} as const

interface Priority {
  id: 'dues' | 'expiring' | 'inactive'
  tone: (typeof TONES)[keyof typeof TONES]
  icon: typeof ShieldAlert
  severity: string
  title: string
  impact: string
  description: string
  action: string
  /** A page to open, or null to switch to this page's Attendance tab. */
  href: string | null
}

const RECOMMENDATION_TONES: Record<Recommendation['tone'], { edge: string; badge: string }> = {
  critical: { edge: 'border-t-red-500', badge: 'bg-red-50 text-red-700' },
  growth: { edge: 'border-t-brand-500', badge: 'bg-brand-50 text-brand-700' },
  operations: { edge: 'border-t-amber-500', badge: 'bg-amber-50 text-amber-700' },
}

const secondaryButton =
  'inline-flex items-center justify-center gap-1 text-xs font-bold text-slate-800 bg-surface hover:bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl transition-colors'

function reminderLink(gymName: string, member: { name: string; phone: string }, kind: RiskKind, detail: string | null) {
  const message =
    kind === 'dues'
      ? `Hi ${member.name}, this is a reminder from ${gymName} about your pending dues of ₹${Number(detail).toLocaleString('en-IN')}. Please clear it at the desk on your next visit. Thank you!`
      : kind === 'renewal'
        ? `Hi ${member.name}, your membership at ${gymName} ends on ${detail ? formatDate(detail) : 'soon'}. Renew before then to keep your workouts going without a break!`
        : `Hi ${member.name}, we have missed you at ${gymName}! We would love to see you back this week.`
  return buildCustomWhatsAppLink(member.phone, message)
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card rounded-2xl p-5 md:p-6', className)}>{children}</div>
}

function PanelTitle({ icon, title, hint, chip }: { icon: ReactNode; title: string; hint?: string; chip?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-extrabold text-slate-900 flex items-center gap-1.5 tracking-tight">{icon}{title}</h3>
        {hint && <p className="text-xs text-slate-500 font-medium mt-0.5">{hint}</p>}
      </div>
      {chip && <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 rounded-md text-slate-500 uppercase tracking-wider flex-shrink-0">{chip}</span>}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400 font-medium text-center py-10 px-4">{children}</p>
}

function Meter({ share, className, delay = 0 }: { share: number; className: string; delay?: number }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full', className)}
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 1, ease: 'easeOut', delay }}
      />
    </div>
  )
}

function WhatsAppLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg flex-shrink-0 transition-colors"
    >
      <MessageCircle className="w-3.5 h-3.5" />
    </a>
  )
}

export function ReportsClient({ data, gymName, today }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)

  const health = useMemo(() => healthScore(data), [data])
  const collected = useMemo(() => collectionRate(data), [data])
  const rate = useMemo(() => runRate(data.months), [data.months])
  const week = useMemo(() => weekdayInsight(data.attendance), [data.attendance])
  const risks = useMemo(() => atRiskMembers(data, today), [data, today])
  const advice = useMemo(() => recommendations(data), [data])

  const { members, dues, attendance, inactive } = data
  const thisMonth = data.months[data.months.length - 1]
  const sixMonthTotal = data.months.reduce((total, m) => total + m.total, 0)
  const modeTotals = {
    upi: data.months.reduce((total, m) => total + m.upi, 0),
    cash: data.months.reduce((total, m) => total + m.cash, 0),
    card: data.months.reduce((total, m) => total + m.card, 0),
  }
  const inventoryTotal = data.months.reduce((total, m) => total + m.inventory, 0)
  const recoverable = dues.total + members.renewal7

  const priorities: Priority[] = []
  if (dues.count > 0) {
    priorities.push({
      id: 'dues', tone: TONES.red, icon: ShieldAlert, severity: 'Critical',
      title: `${dues.count} ${plural(dues.count, 'member')} with unpaid dues`,
      impact: inr(dues.total),
      description: 'Send a WhatsApp reminder or record a collection from the Dues page.',
      action: 'Open dues', href: '/owner/dues',
    })
  }
  if (members.expiring7 > 0) {
    priorities.push({
      id: 'expiring', tone: TONES.amber, icon: AlertCircle, severity: 'Warning',
      title: `${members.expiring7} ${plural(members.expiring7, 'membership')} ending within 7 days`,
      impact: inr(members.renewal7),
      description: 'The impact is what these members paid for the plan that is ending. Remind them before it lapses.',
      action: 'View expiring', href: '/owner/members?filter=expiring',
    })
  }
  // Only where attendance is being marked — otherwise every member looks absent.
  if (attendance.tracked && inactive.count > 0) {
    priorities.push({
      id: 'inactive', tone: TONES.brand, icon: Users, severity: 'Watch',
      title: `${inactive.count} active ${plural(inactive.count, 'member')} without a check-in for 7+ days`,
      impact: 'Churn risk',
      description: 'Paying members who stop coming are the least likely to renew.',
      action: 'See who', href: null,
    })
  }

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
        health ? `Business health: ${health.score}/100 (${health.status})` : null,
        `Collected in ${thisMonth.label} so far: ${rs(thisMonth.total)}`,
        `Collected in the last six months: ${rs(sixMonthTotal)}`,
        `Outstanding dues: ${rs(dues.total)} from ${dues.count} ${plural(dues.count, 'member')}`,
        `Active / total members: ${members.active} / ${members.total}`,
        `Plans ending within 7 days: ${members.expiring7}    within 30 days: ${members.expiring30}`,
      ].filter((line): line is string => line !== null)
      lines.forEach((line, i) => doc.text(line, 14, 30 + i * 7))

      if (dues.top.length > 0) {
        const startY = 30 + lines.length * 7 + 6
        doc.text(dues.count > dues.top.length ? `Largest dues (${dues.top.length} of ${dues.count})` : 'Outstanding dues', 14, startY)
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
    <div className="space-y-6 md:space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reports</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 mt-1">Operational Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Revenue, dues, attendance and renewals for <span className="font-bold text-slate-800">{gymName}</span>
          </p>
        </div>
        <div className="self-start sm:self-auto sm:text-right">
          <button
            onClick={exportPdf}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 bg-surface border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60"
          >
            <Download className="w-4 h-4 text-brand-500" />
            {exporting ? 'Exporting…' : 'Executive PDF'}
          </button>
          {exportFailed && <p className="text-[11px] text-red-600 font-semibold mt-1.5">Could not create the PDF. Check your connection and try again.</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 overflow-x-auto no-scrollbar max-w-full w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'relative px-4 md:px-5 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl whitespace-nowrap z-10 transition-colors',
              tab === id ? 'text-emphasis-fg' : 'text-slate-500 hover:text-slate-900'
            )}
          >
            {tab === id && (
              <motion.div
                layoutId="reportsActiveTab"
                className="absolute inset-0 bg-emphasis rounded-xl shadow-md -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.18 }}
          className="space-y-6"
        >
          {tab === 'overview' && (
            <div className="space-y-6 md:space-y-8">
              {/* Today's priorities */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    Today&apos;s Priorities
                  </h2>
                  {priorities.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded-md">Action required</span>
                  )}
                </div>

                {priorities.length === 0 ? (
                  <Panel className="flex items-center gap-3">
                    <span className="p-2.5 rounded-xl bg-emerald-50 flex-shrink-0"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></span>
                    <div>
                      <p className="font-extrabold text-slate-900 text-sm">Nothing needs chasing today</p>
                      <p className="text-xs text-slate-500 mt-0.5">No unpaid dues and no memberships ending this week.</p>
                    </div>
                  </Panel>
                ) : (
                  <div className={cn('grid gap-4 md:gap-5 grid-cols-1', priorities.length === 2 ? 'md:grid-cols-2' : priorities.length >= 3 ? 'md:grid-cols-3' : '')}>
                    {priorities.map(p => (
                      <div key={p.id} className={cn('card rounded-2xl p-5 md:p-6 border-l-4 flex flex-col justify-between', p.tone.edge)}>
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <span className={cn('p-2.5 rounded-xl flex-shrink-0', p.tone.tile)}><p.icon className={cn('w-5 h-5', p.tone.icon)} /></span>
                            <span className="text-[10px] font-black text-slate-400 tracking-wider text-right">
                              IMPACT: <span className="text-slate-900">{p.impact}</span>
                            </span>
                          </div>
                          <h3 className="font-extrabold text-slate-900 text-sm md:text-base tracking-tight leading-snug">{p.title}</h3>
                          <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
                        </div>
                        <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between items-center gap-3">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Severity: <span className={cn('font-extrabold', p.tone.word)}>{p.severity}</span>
                          </span>
                          {p.href ? (
                            <Link href={p.href} className={secondaryButton}>{p.action} <ChevronRight className="w-3.5 h-3.5 text-slate-500" /></Link>
                          ) : (
                            <button onClick={() => setTab('attendance')} className={secondaryButton}>{p.action} <ChevronRight className="w-3.5 h-3.5 text-slate-500" /></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Business health */}
                <Panel className="flex flex-col justify-between">
                  <div className="flex flex-col flex-1">
                    <PanelTitle icon={<Activity className="w-5 h-5 text-emerald-500" />} title="Business Health" chip="Out of 100" />
                    {health ? (
                      <div className="flex flex-col items-center justify-center py-4 relative flex-1">
                        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 144 144">
                          <defs>
                            <linearGradient id="reportsHealthGood" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#10B981" /><stop offset="100%" stopColor="#2563EB" />
                            </linearGradient>
                            <linearGradient id="reportsHealthLow" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#F59E0B" /><stop offset="100%" stopColor="#EF4444" />
                            </linearGradient>
                          </defs>
                          <circle cx="72" cy="72" r="58" className="stroke-slate-100 fill-none" strokeWidth="9" />
                          <motion.circle
                            cx="72" cy="72" r="58" className="fill-none" strokeWidth="9" strokeLinecap="round"
                            stroke={health.score >= 70 ? 'url(#reportsHealthGood)' : 'url(#reportsHealthLow)'}
                            strokeDasharray={2 * Math.PI * 58}
                            initial={{ strokeDashoffset: 2 * Math.PI * 58 }}
                            animate={{ strokeDashoffset: 2 * Math.PI * 58 * (1 - health.score / 100) }}
                            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.15 }}
                          />
                        </svg>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                          <span className="text-3xl font-black text-slate-900 tracking-tight">{health.score}</span>
                          <span className="text-[10px] text-slate-400 font-bold block mt-0.5">/ 100</span>
                        </div>
                      </div>
                    ) : (
                      <Empty>Add members to see a health score.</Empty>
                    )}
                  </div>
                  {health && (
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">Verdict</span>
                        <span className={cn('text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border', STATUS_PILL[health.status])}>{health.status}</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                          <span>Members with a current plan</span><span className="text-slate-800 font-bold">{pct(health.activeShare)}</span>
                        </div>
                        <Meter share={health.activeShare} className="bg-emerald-500" />
                        <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                          <span>Billed fees collected</span><span className="text-slate-800 font-bold">{pct(health.collected)}</span>
                        </div>
                        <Meter share={health.collected} className="bg-brand-500" delay={0.1} />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        60 points for members with a current plan, 40 for fees collected against fees still owed.
                      </p>
                    </div>
                  )}
                </Panel>

                {/* Recoverable revenue */}
                <div className="card rounded-2xl p-5 md:p-6 bg-orange-50/60 border-orange-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h3 className="font-extrabold text-orange-900 flex items-center gap-1.5 tracking-tight">
                        <IndianRupee className="w-5 h-5 text-orange-600" />
                        Recoverable Revenue
                      </h3>
                      <span className="text-[10px] font-black text-orange-700 bg-orange-100 px-2.5 py-1 rounded-md uppercase tracking-wider flex-shrink-0">This week</span>
                    </div>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">{inr(recoverable)}</p>
                    <p className="text-xs text-orange-800 font-semibold mt-1">
                      {recoverable > 0
                        ? `Unpaid dues plus renewals due from ${dues.count + members.expiring7} ${plural(dues.count + members.expiring7, 'member')}`
                        : 'No unpaid dues and no renewals due this week'}
                    </p>

                    <div className="grid grid-cols-2 gap-3 mt-5">
                      <div className="bg-surface p-3 rounded-xl border border-orange-100">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Unpaid dues</span>
                        <span className="text-sm font-black text-red-600">{inr(dues.total)}</span>
                      </div>
                      <div className="bg-surface p-3 rounded-xl border border-orange-100">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Renewals · 7 days</span>
                        <span className="text-sm font-black text-amber-600">{inr(members.renewal7)}</span>
                      </div>
                    </div>

                    {collected !== null && (
                      <div className="mt-4 space-y-1.5 bg-surface p-3.5 rounded-xl border border-orange-100">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                          <span>COLLECTION RATE</span>
                          <span className="text-orange-700 font-extrabold">{pct(collected)}</span>
                        </div>
                        <Meter share={collected} className="bg-orange-500" />
                        <p className="text-[10px] text-slate-400 font-semibold">
                          {inr(sixMonthTotal)} collected in six months against {inr(dues.total)} still owed.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-4 border-t border-orange-100 flex gap-2.5">
                    <Link href="/owner/dues" className="flex-1 text-center py-2.5 text-xs font-black text-white bg-orange-500 hover:brightness-95 rounded-xl transition-all active:scale-[0.97]">
                      Collect dues
                    </Link>
                    <Link href="/owner/members?filter=expiring" className="flex-1 text-center py-2.5 text-xs font-bold text-slate-700 bg-surface hover:bg-slate-50 border border-orange-200 rounded-xl transition-all active:scale-[0.97]">
                      Renewals
                    </Link>
                  </div>
                </div>

                {/* Members at risk */}
                <Panel className="flex flex-col justify-between">
                  <div>
                    <PanelTitle icon={<ShieldAlert className="w-5 h-5 text-red-500" />} title="Members at Risk" chip={risks.length > 0 ? 'Follow up' : undefined} />
                    {risks.length === 0 ? (
                      <Empty>No member is behind on dues, about to lapse, or missing from the gym.</Empty>
                    ) : (
                      <div className="space-y-2.5 mt-4">
                        {risks.map(member => (
                          <div key={`${member.kind}-${member.phone}-${member.name}`} className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-slate-800 truncate">{member.name}</span>
                                <span className={cn(
                                  'text-[9px] font-black px-2 py-0.5 rounded-full uppercase border flex-shrink-0',
                                  member.level === 'High' ? 'text-red-600 bg-red-50 border-red-100' : 'text-amber-600 bg-amber-50 border-amber-100'
                                )}>
                                  {member.level}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-semibold">{member.reason}</span>
                            </div>
                            <WhatsAppLink href={reminderLink(gymName, member, member.kind, member.detail)} label={`Message ${member.name} on WhatsApp`} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {attendance.tracked && inactive.count > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 text-center">
                      <button onClick={() => setTab('attendance')} className="text-xs font-bold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 group">
                        See all {inactive.count} inactive {plural(inactive.count, 'member')}
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  )}
                </Panel>
              </div>

              {/* Recommendations */}
              {advice.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-extrabold text-slate-900 flex items-center gap-2 tracking-tight">
                    <Sparkles className="w-5 h-5 text-brand-500" />
                    Recommendations
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
                    {advice.map(item => {
                      const tone = RECOMMENDATION_TONES[item.tone]
                      const href = item.id === 'dues' ? '/owner/dues' : item.id === 'annual' ? '/owner/members?filter=expiring' : item.id === 'lapsed' ? '/owner/members?filter=expired' : null
                      const button = 'mt-5 w-full text-center py-2.5 text-xs font-bold text-slate-800 bg-surface hover:bg-slate-50 border border-slate-200 rounded-xl transition-all active:scale-[0.97]'
                      return (
                        <div key={item.id} className={cn('card rounded-2xl p-5 md:p-6 border-t-4 flex flex-col justify-between', tone.edge)}>
                          <div className="space-y-3">
                            <span className={cn('inline-block text-[9px] uppercase font-black px-2 py-0.5 rounded', tone.badge)}>{item.badge}</span>
                            <h4 className="font-extrabold text-slate-900 text-sm tracking-tight leading-snug">{item.title}</h4>
                            <p className="text-xs text-slate-500 leading-relaxed">{item.body}</p>
                          </div>
                          {href
                            ? <Link href={href} className={button}>{item.action}</Link>
                            : <button onClick={() => setTab('attendance')} className={button}>{item.action}</button>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'revenue' && (
            <div className="space-y-4 md:space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                <Panel className="lg:col-span-2 flex flex-col justify-between">
                  <div>
                    <PanelTitle
                      icon={<BarChart2 className="w-5 h-5 text-brand-500" />}
                      title="Collections Trend"
                      hint="Membership fees, dues collected and inventory sales, in the month the money came in"
                      chip="6 months"
                    />
                    {sixMonthTotal > 0
                      ? <div className="h-64 mt-6"><CollectionsChart months={data.months} average={rate?.average ?? null} /></div>
                      : <Empty>No collections recorded in the last six months.</Empty>}
                  </div>
                  {sixMonthTotal > 0 && (
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500 flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                        <span className="text-slate-700">{thisMonth.label} so far: {inr(thisMonth.total)}</span>
                      </div>
                      {rate ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100">Lowest month: {inr(rate.low)}</span>
                          <span className="text-[10px] text-brand-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{rate.basis}-month average: {inr(rate.average)}</span>
                          <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Highest: {inr(rate.high)}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">An average appears after two full months of collections.</span>
                      )}
                    </div>
                  )}
                </Panel>

                <Panel className="flex flex-col justify-between">
                  <div>
                    <PanelTitle icon={<PieChart className="w-5 h-5 text-emerald-500" />} title="Payment Mode Mix" hint="How the last six months were paid" />
                    {sixMonthTotal > 0
                      ? <div className="h-56 mt-2"><PaymentModeDonut {...modeTotals} /></div>
                      : <Empty>Nothing collected yet.</Empty>}
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 text-center text-xs border-t border-slate-100 pt-4">
                    {([['UPI', modeTotals.upi, 'text-blue-600'], ['CASH', modeTotals.cash, 'text-emerald-600'], ['CARD', modeTotals.card, 'text-purple-600']] as const).map(([label, value, colour]) => (
                      <div key={label} className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <span className={cn('text-[10px] font-bold block mb-0.5', colour)}>{label}</span>
                        <span className="font-black text-slate-800">{inr(value)}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                <Panel className="lg:col-span-2">
                  <PanelTitle icon={<MapPin className="w-5 h-5 text-indigo-500" />} title="Top Localities" hint="Where your members come from" />
                  {data.areas.length === 0 ? (
                    <Empty>Add an area to member profiles to see where your members come from.</Empty>
                  ) : (
                    <div className="space-y-4 mt-6">
                      {data.areas.map((area, i) => (
                        <div key={area.area} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-800 flex items-center gap-1.5 min-w-0">
                              <span className="text-slate-400 font-mono text-[10px]">#{i + 1}</span>
                              <span className="truncate">{area.area}</span>
                            </span>
                            <span className="text-slate-900 font-black flex-shrink-0">{area.count} {plural(area.count, 'member')}</span>
                          </div>
                          <Meter share={area.count / data.areas[0].count} className={i === 0 ? 'bg-indigo-500' : i === 1 ? 'bg-blue-500' : 'bg-slate-400'} delay={i * 0.06} />
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel>
                  <PanelTitle icon={<Layers className="w-5 h-5 text-indigo-500" />} title="Plan Distribution" hint="Active members by the plan they are on" />
                  {data.plans.length === 0 ? (
                    <Empty>No active memberships.</Empty>
                  ) : (
                    <div className="space-y-3 mt-5">
                      {data.plans.map(plan => (
                        <div key={plan.plan} className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">{PLAN_NAMES[plan.plan] ?? plan.plan}</span>
                            <span className="text-lg font-black text-slate-800">{plan.count} <span className="text-xs text-slate-500 font-semibold">{plural(plan.count, 'member')}</span></span>
                          </div>
                          <span className={cn('text-xs font-black bg-surface px-2.5 py-1 rounded-lg border border-slate-200', PLAN_COLOURS[plan.plan] ?? 'text-slate-600')}>
                            {pct(plan.count / members.active)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {tab === 'attendance' && (
            <div className="space-y-4 md:space-y-6">
              {!week ? (
                <Panel>
                  <PanelTitle icon={<Flame className="w-5 h-5 text-orange-500" />} title="Attendance" />
                  <Empty>No check-ins in the last 90 days. Mark attendance and your busy days will show up here.</Empty>
                </Panel>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                  <Panel className="lg:col-span-2">
                    <PanelTitle
                      icon={<Flame className="w-5 h-5 text-orange-500" />}
                      title="Check-ins by Weekday"
                      hint={`${attendance.total.toLocaleString('en-IN')} check-ins in the last 90 days`}
                      chip={`Today: ${attendance.today}`}
                    />
                    <div className="h-64 mt-6"><WeekdayBars byDay={attendance.byDay} /></div>
                    <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-start gap-3 mt-5">
                      <Clock className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-black text-orange-800 uppercase block tracking-wider">Footfall</span>
                        <p className="text-xs text-orange-700 mt-0.5 leading-relaxed font-semibold">
                          {week.busiest.name} is the busiest day with {week.busiest.count} check-ins; {week.quietest.name} is the quietest with {week.quietest.count}.{' '}
                          {pct(week.morningShare)} of check-ins are in the morning session and {pct(1 - week.morningShare)} in the evening.
                        </p>
                      </div>
                    </div>
                  </Panel>

                  <Panel className="flex flex-col justify-between">
                    <div>
                      <PanelTitle icon={<Activity className="w-5 h-5 text-emerald-500" />} title="Weekly Heatmap" hint="Each day against your busiest day" />
                      <div className="grid grid-cols-7 gap-1.5 md:gap-2.5 text-center mt-5">
                        {attendance.byDay.map(day => {
                          const ratio = day.count / Math.max(week.busiest.count, 1)
                          const heat = ratio > 0.8 ? 'bg-red-500 border-red-500 text-white font-black'
                            : ratio > 0.5 ? 'bg-orange-400 border-orange-400 text-white font-bold'
                            : ratio > 0.2 ? 'bg-blue-400 border-blue-400 text-white font-bold'
                            : ratio > 0 ? 'bg-emerald-100 border-emerald-200 text-emerald-800 font-semibold'
                            : 'bg-slate-50 border-slate-100 text-slate-400'
                          return (
                            <div key={day.name} className="space-y-2">
                              <span className="text-[10px] font-black text-slate-400 block uppercase">{day.name.slice(0, 1)}</span>
                              <div className={cn('h-14 rounded-xl border flex items-center justify-center text-xs', heat)}>{day.count}</div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-5">
                        {([['Morning session', attendance.morning], ['Evening session', attendance.evening]] as const).map(([label, value]) => (
                          <div key={label} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">{label}</span>
                            <span className="text-lg font-black text-slate-800">{value.toLocaleString('en-IN')}</span>
                            <span className="text-[10px] text-slate-500 font-semibold block">{pct(value / attendance.total)} of check-ins</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold flex items-center justify-between border-t border-slate-100 pt-4 mt-6">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200" /> Light</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-400" /> Moderate</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500" /> Peak</span>
                    </div>
                  </Panel>
                </div>
              )}

              {attendance.tracked && (
                <Panel>
                  <PanelTitle
                    icon={<Users className="w-5 h-5 text-brand-500" />}
                    title="Active Members Who Have Stopped Coming"
                    hint="A current plan, but no check-in for 7 days or more. Members who joined this week are left out."
                    chip={`${inactive.count} ${plural(inactive.count, 'member')}`}
                  />
                  {inactive.top.length === 0 ? (
                    <Empty>Every active member has checked in during the last 7 days.</Empty>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-5">
                        {inactive.top.map(member => {
                          const days = member.lastVisit ? differenceInCalendarDays(parseISO(today), parseISO(member.lastVisit)) : null
                          return (
                            <div key={`${member.phone}-${member.name}`} className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="min-w-0">
                                <p className="font-extrabold text-slate-800 truncate">{member.name}</p>
                                <p className="text-[10px] text-slate-400 font-semibold">
                                  {member.lastVisit ? `Last check-in ${formatDate(member.lastVisit)} · ${days} days ago` : 'No check-in in the last 90 days'}
                                </p>
                              </div>
                              <WhatsAppLink href={reminderLink(gymName, member, 'checkin', member.lastVisit)} label={`Message ${member.name} on WhatsApp`} />
                            </div>
                          )
                        })}
                      </div>
                      {inactive.count > inactive.top.length && (
                        <p className="text-[11px] text-slate-400 font-semibold mt-3">Showing the {inactive.top.length} who have been away longest, of {inactive.count}.</p>
                      )}
                    </>
                  )}
                </Panel>
              )}
            </div>
          )}

          {tab === 'marketing' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              <Panel className="lg:col-span-2">
                <PanelTitle icon={<Layers className="w-5 h-5 text-blue-500" />} title="Membership Expiry Funnel" hint="Where your members stand today, as a share of everyone on your rolls" />
                {members.total === 0 ? (
                  <Empty>Add members to see the funnel.</Empty>
                ) : (
                  <div className="space-y-4 mt-6">
                    {[
                      { label: 'Active members', note: 'Current plan', value: members.active, colour: 'bg-emerald-500' },
                      { label: 'Expiring in 30 days', note: 'Renewals to pitch', value: members.expiring30, colour: 'bg-amber-500' },
                      { label: 'Owing dues', note: 'Fees to recover', value: dues.count, colour: 'bg-orange-500' },
                      { label: 'Expired or no plan', note: 'Members to win back', value: members.expired, colour: 'bg-red-500' },
                    ].map((stage, i) => (
                      <div key={stage.label} className="space-y-1.5">
                        <div className="flex justify-between items-baseline gap-3 text-xs">
                          <span className="text-slate-900 font-extrabold">{stage.label} <span className="text-slate-400 font-semibold">· {stage.note}</span></span>
                          <span className="text-slate-800 font-bold flex-shrink-0">{stage.value} <span className="text-slate-400 font-semibold">({pct(stage.value / members.total)})</span></span>
                        </div>
                        <div className="h-5 bg-slate-100 rounded-lg overflow-hidden">
                          <motion.div
                            className={cn('h-full rounded-lg', stage.colour)}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${Math.min(100, (stage.value / members.total) * 100)}%` }}
                            viewport={{ once: true, margin: '-40px' }}
                            transition={{ duration: 1, ease: 'easeOut', delay: i * 0.12 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel className="flex flex-col justify-between">
                <div>
                  <PanelTitle icon={<MessageCircle className="w-5 h-5 text-emerald-600" />} title="WhatsApp Automation" hint="Automated messages in the last 30 days" />
                  {data.whatsapp.sent + data.whatsapp.failed === 0 ? (
                    <Empty>No automated messages were sent in the last 30 days.</Empty>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">Sent</span>
                          <span className="text-xl font-black text-slate-900">{data.whatsapp.sent}</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">Failed</span>
                          <span className={cn('text-xl font-black', data.whatsapp.failed > 0 ? 'text-red-600' : 'text-emerald-600')}>{data.whatsapp.failed}</span>
                        </div>
                      </div>
                      <div className="space-y-2 mt-4">
                        {data.whatsapp.templates.map(template => (
                          <div key={template.template} className="flex justify-between text-xs">
                            <span className="text-slate-600 font-semibold truncate">{templateLabel(template.template)}</span>
                            <span className="text-slate-900 font-black flex-shrink-0">{template.count}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100">
                  {dues.count > 0 ? (
                    <Link href="/owner/dues" className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:brightness-95 active:scale-[0.97] text-white text-xs font-black rounded-xl transition-all">
                      <MessageCircle className="w-4 h-4" /> Remind {dues.count} {plural(dues.count, 'member')} about dues
                    </Link>
                  ) : (
                    <p className="text-xs text-slate-400 font-semibold text-center">No dues to remind anyone about.</p>
                  )}
                </div>
              </Panel>
            </div>
          )}

          {tab === 'inventory' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              <Panel className="lg:col-span-2">
                <PanelTitle icon={<BarChart2 className="w-5 h-5 text-brand-500" />} title="Inventory Sales Trend" hint="Revenue from product sales, by month" chip="6 months" />
                {inventoryTotal > 0
                  ? <div className="h-64 mt-6"><InventoryChart months={data.months} /></div>
                  : <Empty>No product sales in the last six months.</Empty>}
              </Panel>

              <Panel className="flex flex-col">
                <PanelTitle icon={<Package className="w-5 h-5 text-emerald-500" />} title="Recent Sales" />
                {data.recentSales.length === 0 ? (
                  <Empty>No sales yet.</Empty>
                ) : (
                  <div className="space-y-2.5 mt-5">
                    {data.recentSales.map((sale, i) => (
                      <div key={`${sale.soldAt}-${i}`} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{sale.product}</p>
                          <p className="text-[10px] text-slate-500 truncate">{sale.variant}</p>
                          <p className="text-[9px] text-slate-400 font-semibold">{format(new Date(sale.soldAt), 'd MMM, h:mm a')} · {MODE_NAMES[sale.mode] ?? sale.mode}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-black text-emerald-600">{inr(sale.total)}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Qty: {sale.quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
