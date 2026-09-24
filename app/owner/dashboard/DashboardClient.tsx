'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, Clock, AlertTriangle, CheckSquare, MessageCircle, Plus, TrendingUp, FileText, IndianRupee, CalendarCheck, ClipboardList } from 'lucide-react'
import { buildWhatsAppLink, formatCurrency, isValidPhone } from '@/lib/utils'
import { generateDailyReportPDF } from '@/lib/pdf'
import type { DashboardStats, MemberWithStatus } from '@/types'
import { useGymRealtime } from '@/lib/hooks/useGymRealtime'
import { tourAttr } from '@/lib/tours/anchors'

interface Props {
  gymName: string
  stats: DashboardStats
  expiringMembers: MemberWithStatus[]
  gymId: string
}

export function DashboardClient({ gymName, stats, expiringMembers, gymId }: Props) {
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [expiringFilter, setExpiringFilter] = useState<'week' | 'month'>('week')
  const [monthMembers, setMonthMembers] = useState<MemberWithStatus[] | null>(null)
  const [fetchingMonth, setFetchingMonth] = useState(false)

  // Auto-refresh dashboard when memberships or attendance changes.
  useGymRealtime(gymId, ['members', 'memberships', 'attendance'])

  useEffect(() => {
    if (expiringFilter === 'month' && monthMembers === null && !fetchingMonth) {
      setFetchingMonth(true)
      const fetchMonth = async () => {
        const res = await fetch('/api/dashboard/expiring')
        const json = await res.json()
        if (res.ok && json.data) {
          setMonthMembers(json.data)
        }
        setFetchingMonth(false)
      }
      fetchMonth()
    }
  }, [expiringFilter, gymId, monthMembers, fetchingMonth])

  // Daily Report PDF
  async function handleDailyPDF() {
    setGeneratingPDF(true)
    try {
      const res = await fetch('/api/dashboard/daily-report')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message || 'Failed to fetch report data')

      const { payments, newMembers, date } = json.data
      generateDailyReportPDF({ gymName, date, payments, newMembers })
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setGeneratingPDF(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5 animate-slide-up w-full h-full">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="object-contain md:w-8 md:h-8" priority />
            <span className="text-xs sm:text-sm text-slate-500 font-medium truncate max-w-[180px] sm:max-w-none">{gymName}</span>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        </div>
      </div>

      {/* Stats Grid — 2 cols mobile, 3 cols tablet, 6 cols desktop */}
      <div {...tourAttr('dashStats')} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
        <StatCard
          Icon={Users} tone="green"
          label="Active" value={stats.total_active}
          href="/owner/members?filter=active"
        />
        <StatCard
          Icon={CheckSquare} tone="blue"
          label="Attendance" value={stats.today_attendance}
          href="/owner/attendance"
        />
        <StatCard
          Icon={Clock} tone="amber"
          label="Expiring" value={stats.expiring_this_week}
          href="/owner/members?filter=expiring"
        />
        <StatCard
          Icon={AlertTriangle} tone="red"
          label="Expired" value={stats.expired_count}
          href="/owner/members?filter=expired"
        />
        <StatCardCurrency
          Icon={IndianRupee} tone="cyan"
          label="Today's Collection" value={stats.today_collection}
        />
        <StatCardCurrency
          Icon={AlertTriangle} tone="orange"
          label="Total Dues" value={stats.total_dues}
          href="/owner/dues" danger
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-stretch" style={{ minHeight: '420px' }}>
        {/* Expiring members — fills all available horizontal space */}
        <div {...tourAttr('dashExpiring')} className="flex-1 min-w-0 flex flex-col">
          <motion.div
            className="card flex-1 flex flex-col"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.15 }}
          >
            <ExpiringContent
              expiringMembers={expiringFilter === 'month' ? (monthMembers || []) : expiringMembers}
              expiringFilter={expiringFilter}
              setExpiringFilter={setExpiringFilter}
              fetchingMonth={fetchingMonth}
            />
          </motion.div>
        </div>

        {/* Quick Actions — fixed width on desktop, full width on mobile */}
        <div {...tourAttr('dashQuickActions')} className="w-full lg:w-72 xl:w-80 flex-shrink-0 card p-4 md:p-5 flex flex-col gap-3 bg-gradient-to-b from-surface to-slate-50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp className="w-3 h-3" />
            Quick Actions
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:gap-2.5 flex-1 lg:justify-center">
            <QuickAction
              href="/owner/members/new" anchor="dashAddMember"
              Icon={Plus} tone="brand" label="Add New Member"
            />
            <QuickAction
              href="/owner/attendance" anchor="dashMarkAttendance"
              Icon={CalendarCheck} tone="cyan" label="Mark Attendance"
            />
            <QuickAction
              href="/owner/members/attendance" anchor="dashAttendanceLog"
              Icon={ClipboardList} tone="indigo" label="Attendance Log"
            />
            <QuickAction
              onClick={handleDailyPDF} disabled={generatingPDF} anchor="dashReportBtn"
              Icon={FileText} tone="emerald"
              label={generatingPDF ? 'Generating...' : 'Daily Report PDF'}
            />
            <QuickAction
              href="/owner/dues" anchor="dashViewDues"
              Icon={IndianRupee} tone="red" label="View Fee Dues"
              className="col-span-2 lg:col-span-1"
              badge={stats.total_dues > 0 ? formatCurrency(stats.total_dues) : undefined}
            />
          </div>
        </div>
      </div>

    </div>
  )
}

function ExpiringContent({
  expiringMembers,
  expiringFilter,
  setExpiringFilter,
  fetchingMonth
}: {
  expiringMembers: MemberWithStatus[],
  expiringFilter: 'week' | 'month',
  setExpiringFilter: (f: 'week' | 'month') => void,
  fetchingMonth: boolean
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 md:px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" />
          <select
            value={expiringFilter}
            onChange={(e) => setExpiringFilter(e.target.value as 'week' | 'month')}
            className="font-bold text-slate-900 text-sm md:text-base bg-transparent outline-none cursor-pointer hover:bg-slate-50 py-1 pr-1 rounded"
          >
            <option value="week">Expiring This Week</option>
            <option value="month">Expiring This Month</option>
          </select>
          {fetchingMonth && <span className="text-xs text-slate-400 animate-pulse ml-2">Loading...</span>}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/owner/members?filter=expiring" className="text-brand-600 text-sm font-semibold">See all</Link>
        </div>
      </div>
      {expiringMembers.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-2xl mb-1">🎉</p>
          <p className="text-slate-400 text-sm">No members expiring this {expiringFilter}</p>
        </div>
      ) : (
        <div className="flex-1 relative min-h-[200px]">
          <div className="absolute inset-0 overflow-y-auto divide-y divide-slate-50 overscroll-contain">
            {expiringMembers.map((member) => <ExpiringMemberRow key={member.id} member={member} />)}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Colour tones for the stat cards.
 *
 * These cards used to take four hex strings as props — iconBg, cardBg, borderColor,
 * valueColor — and apply them through inline `style`. That made them the most stubbornly
 * light thing in the app under a dark theme: an inline style is not a class, so no palette
 * or utility can reach it. They stayed pale green, blue, amber, red, cyan and orange on a
 * black page while everything around them themed correctly.
 *
 * Every one of those hexes turned out to be a literal Tailwind value written the long way —
 * #DCFCE7 is green-100, #1D4ED8 is blue-700, and so on for all 24 — so naming the tone and
 * letting Tailwind resolve it is byte-identical in light mode and themes for free in dark.
 *
 * Passing a tone name rather than colours also removes the possibility of a card being given
 * a background from one family and a value colour from another, which the old call sites did
 * in one case (a blue-500 border with a brand-600 value).
 */
type StatTone = 'green' | 'blue' | 'amber' | 'red' | 'cyan' | 'orange'

/*
  Light mode fills the whole card with the tone. Dark mode does not, and that is deliberate.

  A tinted card works on white because a pale wash still reads as "white card, slightly
  green". The same idea inverted gives a dark green-brown block, and six of them side by side
  look like six different muddy colours rather than one coherent row — which is exactly how it
  looked once the tints started theming.

  So in dark mode the card drops to the ordinary surface with a neutral hairline, and the tone
  survives where it carries the meaning: the icon chip and the number. Colour becomes an accent
  instead of a fill, which is also what makes the row read as one component.
*/
/*
  The chip steps up to 200 in dark mode. At 100 the darkest families sit almost exactly on the
  card — `red-100` is `69 10 10` against a `23 23 23` card, a ratio of 1.11 — so the chip
  dissolved and the icon looked like it was floating on the card with no container. Step 200
  keeps every chip separated while staying far enough under the glyph to leave it readable.
*/
const STAT_TONES: Record<StatTone, { card: string; iconBg: string; value: string; glyph: string }> = {
  green:  { card: 'bg-green-50 border-green-500 dark:bg-surface dark:border-slate-200',   iconBg: 'bg-green-100 dark:bg-green-200',  value: 'text-green-700',  glyph: 'text-green-600' },
  blue:   { card: 'bg-blue-50 border-blue-500 dark:bg-surface dark:border-slate-200',     iconBg: 'bg-blue-100 dark:bg-blue-200',   value: 'text-blue-700',   glyph: 'text-blue-600' },
  amber:  { card: 'bg-amber-50 border-amber-500 dark:bg-surface dark:border-slate-200',   iconBg: 'bg-amber-100 dark:bg-amber-200', value: 'text-amber-700',  glyph: 'text-amber-600' },
  red:    { card: 'bg-red-50 border-red-500 dark:bg-surface dark:border-slate-200',       iconBg: 'bg-red-100 dark:bg-red-200',     value: 'text-red-700',    glyph: 'text-red-600' },
  cyan:   { card: 'bg-cyan-50 border-cyan-500 dark:bg-surface dark:border-slate-200',     iconBg: 'bg-cyan-100 dark:bg-cyan-200',   value: 'text-cyan-700',   glyph: 'text-cyan-600' },
  orange: { card: 'bg-orange-50 border-orange-500 dark:bg-surface dark:border-slate-200', iconBg: 'bg-orange-100 dark:bg-orange-200', value: 'text-orange-700', glyph: 'text-orange-600' },
}

type StatIcon = React.ComponentType<{ className?: string }>

/**
 * Quick-action buttons.
 *
 * Light mode keeps the saturated gradient each of these has always had. Dark mode does not:
 * four fully saturated gradients — blue, cyan, indigo, green — stacked against a black page
 * read as a strip of neon, and they end up louder than the data they sit beside. Brightness is
 * not emphasis once the page is dark; on white a saturated fill advances, on black it glares.
 *
 * So in dark mode the gradient is switched off entirely (`dark:bg-none`, which clears the
 * background-image a gradient actually is) and replaced with the tone's own dark tint, a
 * hairline in the same hue, and the icon chip carrying the colour. The buttons stay
 * distinguishable from each other and from the cards, without competing with them.
 *
 * Collapsing five near-identical blocks into one component also removes the drift that was
 * already there: four used `p-3 rounded-xl` with a `bg-white/20` chip while the fifth had its
 * own border, padding and hover, so any change had to be made in five places.
 */
type QuickTone = 'brand' | 'cyan' | 'indigo' | 'emerald' | 'red'

/*
  Why every button goes quiet in dark mode.

  Three treatments were tried here and two were too loud. The saturated gradients carried over
  from light mode read as a strip of neon against a black page. Replacing the primary with the
  inverted `emphasis` pair fixed contrast but swapped one kind of glare for another: a near-white
  slab is the brightest thing on the screen, which is not what a sidebar of shortcuts should be.

  Tinting each button with its own family is the option that looks right on paper and measures
  worst: `brand`'s dark tint is `13 21 51`, within 0.1% of the `23 23 23` panel behind it
  (contrast 1.001), so the button would have separated from its container by hue alone.

  What is left is elevation. All five sit on `surface-card` — 38 against the panel's 23, a clear
  1.18 step — with a hairline, and the tone surviving only in the icon glyph.

  The chip behind that glyph is a hue-free `white/10` rather than the tone's own 200, which is
  the one place this differs from the stat cards. On the stat cards a tone-200 chip sits on the
  23 surface and separates cleanly (1.7-2.0), but these buttons are already lifted to 38, and
  `brand-200` is `23 37 84` — a 1.03 ratio against the button, so the chip dissolved. A neutral
  lift reads identically for all five and cannot collide with any family.

  The primary is marked by a saturated hairline rather than a fill: one pixel of brand blue is
  enough to rank it without lighting up the column.
*/
const QUICK_TONES: Record<QuickTone, { light: string; dark: string; chip: string; glyph: string }> = {
  brand: {
    light: 'bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:shadow-lg hover:shadow-brand-200',
    // border-brand-500 is the literal saturated step, so the primary keeps a real blue edge in
    // dark instead of the themed 300 the others use.
    dark: 'dark:bg-none dark:bg-surface-card dark:border dark:border-brand-500 dark:hover:bg-slate-200 dark:hover:shadow-none',
    chip: 'bg-white/20 dark:bg-white/10',
    glyph: 'dark:text-brand-600',
  },
  cyan: {
    light: 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white hover:shadow-lg hover:shadow-cyan-200',
    dark: 'dark:bg-none dark:bg-surface-card dark:border dark:border-slate-300 dark:hover:bg-slate-200 dark:hover:shadow-none',
    chip: 'bg-white/20 dark:bg-white/10',
    glyph: 'dark:text-cyan-600',
  },
  indigo: {
    light: 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white hover:shadow-lg hover:shadow-indigo-200',
    dark: 'dark:bg-none dark:bg-surface-card dark:border dark:border-slate-300 dark:hover:bg-slate-200 dark:hover:shadow-none',
    chip: 'bg-white/20 dark:bg-white/10',
    glyph: 'dark:text-indigo-600',
  },
  emerald: {
    light: 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:shadow-lg hover:shadow-emerald-200',
    dark: 'dark:bg-none dark:bg-surface-card dark:border dark:border-slate-300 dark:hover:bg-slate-200 dark:hover:shadow-none',
    chip: 'bg-white/20 dark:bg-white/10',
    glyph: 'dark:text-emerald-600',
  },
  /*
    Dues is outlined rather than filled in light mode, because it is a warning the owner should
    notice without it competing with the primary action. Its light `bg-surface` themes to the
    same 23 as the panel, so in dark it needs the same lift as the others; the label keeps its
    themed red.
  */
  red: {
    light: 'bg-surface text-red-600 border-2 border-red-100 hover:bg-red-50',
    // `dark:border` overrides the light `border-2` down to 1px, so this button does not carry a
    // visibly thicker edge than the other four once they all become outlined neutrals.
    dark: 'dark:bg-surface-card dark:border dark:border-slate-300 dark:hover:bg-slate-200',
    chip: 'bg-red-50 dark:bg-white/10',
    glyph: 'dark:text-red-600',
  },
}

function QuickAction({ href, onClick, disabled, anchor, Icon, tone, label, badge, className }: {
  href?: string
  onClick?: () => void
  disabled?: boolean
  // Taken from tourAttr rather than widened to string, so a mistyped anchor fails to compile
  // instead of silently dropping the product-tour target.
  anchor: Parameters<typeof tourAttr>[0]
  Icon: StatIcon
  tone: QuickTone
  label: string
  badge?: string
  className?: string
}) {
  const t = QUICK_TONES[tone]
  /*
    No label override here, deliberately. The four filled variants already carry a literal
    `text-white` from their light classes, and white on the dark neutral surface still reads at
    ~15:1, so it needs no help. Dues is the only one with a coloured label and its `text-red-600`
    is themed, so it lightens on its own. A blanket `dark:text-*` would have had to fight both.
  */
  const shell =
    `flex items-center gap-2 rounded-xl p-3 font-bold text-sm active:scale-95 transition-all ` +
    `disabled:opacity-60 ${t.light} ${t.dark} ${className ?? ''}`

  const body = (
    <>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${t.chip}`}>
        <Icon className={`w-4 h-4 ${t.glyph}`} />
      </div>
      <span className="text-xs sm:text-sm">{label}</span>
      {badge && (
        <span className="ml-auto text-xs bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
          {badge}
        </span>
      )}
    </>
  )

  if (href) {
    return (
      <Link href={href} {...tourAttr(anchor)} className={shell}>
        {body}
      </Link>
    )
  }
  return (
    <button onClick={onClick} disabled={disabled} {...tourAttr(anchor)} className={`w-full ${shell}`}>
      {body}
    </button>
  )
}

function StatShell({ Icon, tone, label, children, href }: {
  Icon: StatIcon; tone: StatTone; label: string; children: React.ReactNode; href?: string
}) {
  const t = STAT_TONES[tone]
  const content = (
    <div className={`card border p-3 xs:p-3.5 md:p-4 hover:shadow-md transition-all ${t.card}`}>
      <div className={`w-7 h-7 xs:w-8 xs:h-8 rounded-xl flex items-center justify-center mb-2 ${t.iconBg}`}>
        {/* The glyph colour comes from the tone too, so the icon can never be left on a hue
            that no longer matches the card it sits in. */}
        <Icon className={`w-4 h-4 ${t.glyph}`} />
      </div>
      {children}
      <p className="text-[10px] xs:text-xs text-slate-500 mt-1 leading-tight">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

function StatCard({ Icon, tone, label, value, href }: {
  Icon: StatIcon; tone: StatTone; label: string; value: number; href?: string
}) {
  return (
    <StatShell Icon={Icon} tone={tone} label={label} href={href}>
      <p className={`text-xl xs:text-2xl font-bold leading-none ${STAT_TONES[tone].value}`}>{value}</p>
    </StatShell>
  )
}

function StatCardCurrency({ Icon, tone, label, value, href, danger }: {
  Icon: StatIcon; tone: StatTone; label: string; value: number; href?: string; danger?: boolean
}) {
  // danger promotes the figure to red once there is an outstanding amount; red-600 themes, so
  // it lightens in dark mode instead of staying the near-black red the old #DC2626 became.
  const valueClass = danger && value > 0 ? 'text-red-600' : STAT_TONES[tone].value
  return (
    <StatShell Icon={Icon} tone={tone} label={label} href={href}>
      <p className={`text-sm xs:text-base md:text-lg font-bold leading-none ${valueClass}`}>
        {formatCurrency(value)}
      </p>
    </StatShell>
  )
}

function ExpiringMemberRow({ member }: { member: MemberWithStatus }) {
  const daysLeft = member.days_remaining
  return (
    <div className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="w-8 h-8 bg-gradient-to-br from-brand-100 to-brand-200 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-brand-700 font-bold text-xs">{member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm truncate">{member.name}</p>
        <p className="text-xs text-slate-400">{member.phone}</p>
      </div>
      <p className="text-xs font-semibold text-amber-600 whitespace-nowrap">
        {daysLeft === 0 ? 'Today' : daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
      </p>
      {member.latest_membership && (
        isValidPhone(member.phone) ? (
          <a href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 bg-emerald-500 text-white text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-emerald-600 transition-colors whitespace-nowrap"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Remind</span>
          </a>
        ) : (
          <div className="flex items-center gap-1 bg-slate-200 text-slate-400 text-xs font-semibold px-2 py-1.5 rounded-lg cursor-not-allowed whitespace-nowrap"
            title="Invalid phone number — cannot send WhatsApp message">
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Remind</span>
          </div>
        )
      )}
    </div>
  )
}
