import '../styles/memberapp.css';
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  IndianRupee,
  LayoutGrid,
  Megaphone,
  Menu,
  MessageCircle,
  RefreshCw,
  Signal,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

/* The owner console as it looks on a phone (modelled on the real app: components/layout/ShellGuard.tsx header,
   app/owner/dashboard/DashboardClient.tsx stat cards and quick actions, and the bottom bar in NavClient.tsx).
   Sample data. The screen stays light in both themes, like the member app phone, because it depicts the real app. */

const STATS: { label: string; value: string; icon: LucideIcon; tone: string }[] = [
  { label: 'Active', value: '44', icon: Users, tone: '#047857|#ecfdf5|#a7f3d0' },
  { label: 'Attendance', value: '0', icon: CheckCircle2, tone: '#1d4ed8|#eff6ff|#bfdbfe' },
  { label: 'Expiring', value: '3', icon: Clock, tone: '#b45309|#fffbeb|#fde68a' },
  { label: 'Expired', value: '40', icon: AlertTriangle, tone: '#b91c1c|#fef2f2|#fecaca' },
  { label: "Today's Collection", value: '₹0', icon: IndianRupee, tone: '#0e7490|#ecfeff|#a5f3fc' },
  { label: 'Total Dues', value: '₹8,000', icon: AlertTriangle, tone: '#c2410c|#fff7ed|#fed7aa' },
];

const EXPIRING = [
  { name: 'Vignesh Das', when: 'Today' },
  { name: 'Naveen Verma', when: '3d left' },
];

export function OwnerPhoneCard() {
  return (
    <div aria-hidden className="pointer-events-none select-none">
      <div className="ma-phone mx-auto h-[600px] w-[290px]">
        <div
          role="img"
          aria-label="The GymFlow owner dashboard on a phone: a pending payment banner, six figures for active, attendance, expiring, expired, today's collection and total dues, the members expiring this week with Remind buttons, and quick actions."
          className="relative h-full"
        >
          <span aria-hidden className="absolute -left-[2.5px] top-[88px] h-10 w-[3px] rounded-l-sm bg-[var(--ma-bezel)]" />
          <span aria-hidden className="absolute -right-[2.5px] top-[110px] h-[60px] w-[3px] rounded-r-sm bg-[var(--ma-bezel)]" />

          <div className="relative h-full rounded-[28px] bg-[var(--ma-bezel)] p-[8px]">
            <div className="device-screen relative flex h-full flex-col overflow-hidden rounded-[20px] text-left">
              <div className="flex h-[22px] shrink-0 items-center justify-between bg-[var(--ma-bezel)] px-3 text-[9px] font-semibold text-white">
                <span>9:41</span>
                <span className="flex items-center gap-1">
                  <Wifi className="h-2.5 w-2.5" strokeWidth={2.5} />
                  <Signal className="h-2.5 w-2.5" strokeWidth={2.5} />
                  87%
                </span>
              </div>

              {/* App header: logo, gym name in the middle, theme and account on the right */}
              <div className="relative flex h-[38px] shrink-0 items-center justify-between border-b border-[var(--ma-line)] bg-white px-2.5">
                <img src="/favicon-48.png" alt="" width={22} height={22} className="rounded-md" />
                <span className="absolute left-1/2 -translate-x-1/2 text-[12px] font-black uppercase tracking-tight text-[var(--ma-brand)]">
                  Fit Zone
                </span>
                <span className="flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-[var(--ma-ink3)]" strokeWidth={1.75} />
                  <span className="grid h-[20px] w-[20px] place-items-center rounded-full bg-[var(--ma-tile)] text-[8px] font-bold text-[var(--ma-brand)]">
                    FZ
                  </span>
                </span>
              </div>

              <div className="flex-1 overflow-hidden bg-[var(--ma-bg)] px-2.5 pt-2">
                <p className="text-[8px] font-medium text-[var(--ma-muted)]">Fit Zone Gym</p>
                <p className="text-[15px] font-bold leading-tight tracking-tight text-[var(--ma-ink)]">Dashboard</p>

                <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2 py-1.5">
                  <RefreshCw className="h-3 w-3 shrink-0 text-[#b45309]" />
                  <span className="flex-1 text-[8.5px] font-semibold text-[#b45309]">3 payment requests waiting</span>
                  <span className="text-[8.5px] font-bold text-[#b45309]">Review</span>
                </div>

                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {STATS.map(({ label, value, icon: Icon, tone }) => {
                    const [ink, bg, line] = tone.split('|');
                    return (
                      <div key={label} className="rounded-lg border p-2" style={{ background: bg, borderColor: line }}>
                        <Icon className="h-3 w-3" style={{ color: ink }} />
                        <p className="mt-1 text-[15px] font-black leading-none" style={{ color: ink }}>
                          {value}
                        </p>
                        <p className="mt-1 text-[8px] leading-tight text-[var(--ma-muted)]">{label}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2 rounded-xl border border-[var(--ma-line)] bg-white">
                  <p className="flex items-center gap-1 border-b border-[var(--ma-line)] px-2 py-1.5 text-[9px] font-bold text-[var(--ma-ink)]">
                    <Clock className="h-3 w-3 text-[#b45309]" />
                    Expiring This Week
                  </p>
                  {EXPIRING.map(m => (
                    <div key={m.name} className="flex items-center gap-1.5 border-b border-[var(--ma-line)] px-2 py-1.5 last:border-0">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--ma-tile)] text-[7px] font-bold text-[var(--ma-brand)]">
                        {m.name
                          .split(' ')
                          .map(p => p[0])
                          .join('')}
                      </span>
                      <span className="min-w-0 flex-1 text-[9px] font-semibold text-[var(--ma-ink)]">{m.name}</span>
                      <span className="text-[8px] font-semibold text-[#b45309]">{m.when}</span>
                      <span className="flex items-center gap-0.5 rounded-md bg-[#047857] px-1.5 py-0.5 text-[8px] font-bold text-white">
                        <MessageCircle className="h-2 w-2" />
                        Remind
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-2 text-[8.5px] font-semibold text-[var(--ma-muted)]">Quick actions</p>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {[
                    { l: 'Gym Notices', i: Megaphone, c: '#2563eb' },
                    { l: 'Mark Attendance', i: CalendarCheck, c: '#0e7490' },
                    { l: 'Attendance Log', i: ClipboardList, c: '#3730a3' },
                    { l: 'View Fee Dues', i: IndianRupee, c: '#b91c1c' },
                  ].map(({ l, i: Icon, c }) => (
                    <span key={l} className="flex items-center gap-1 rounded-lg px-2 py-2 text-[8.5px] font-bold text-white" style={{ background: c }}>
                      <Icon className="h-3 w-3 shrink-0" />
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom bar, as on the real app: the current page on the left, the menu button on the right */}
              <div className="flex h-[40px] shrink-0 items-center justify-between border-t border-[var(--ma-line)] bg-white px-3">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--ma-ink)]">
                  <LayoutGrid className="h-3.5 w-3.5 text-[var(--ma-brand)]" />
                  Dashboard
                </span>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f1f5f9] text-[var(--ma-ink3)]">
                  <Menu className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
