import { useLayoutEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Clock,
  CreditCard,
  Dumbbell,
  FileText,
  IndianRupee,
  LayoutDashboard,
  MessageCircle,
  Package,
  Plus,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';

/*
  A live, clickable stand-in for the product screenshot that used to sit in the
  hero as hero.webp.

  Colours are lifted from the real console (app/owner/dashboard/DashboardClient
  and app/design-tokens.css) rather than sampled off the image, so the stat
  cards, quick actions and status pills match the product exactly.

  ── Accessibility ──────────────────────────────────────────────────────────
  The whole canvas is aria-hidden and every control is taken out of the tab
  order. That is deliberate: this is decorative product imagery, and sixteen
  fake buttons sitting above the fold would make a keyboard visitor tab through
  a dashboard that does nothing before reaching the real page. Assistive tech
  gets the same one-sentence description the old <img alt> carried, rendered
  next to the canvas in Hero.
*/

const GYM_NAME = 'Fit Zone Gym';

type ViewId =
  | 'dashboard'
  | 'members'
  | 'payments'
  | 'dues'
  | 'attendance'
  | 'inventory';

interface NavItem {
  id: ViewId | 'programs' | 'reports';
  label: string;
  icon: typeof Users;
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'dues', label: 'Dues', icon: AlertCircle },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'programs', label: 'Programs', icon: Activity, soon: true },
  { id: 'reports', label: 'Reports', icon: TrendingUp, soon: true },
];

/** Exact palettes from the console's StatCard calls. */
const STATS = [
  {
    id: 'active',
    label: 'Active',
    value: '44',
    icon: Users,
    iconColor: '#16A34A',
    iconBg: '#DCFCE7',
    cardBg: '#F0FDF4',
    border: '#22C55E',
    valueColor: '#15803D',
    goto: 'members' as ViewId,
  },
  {
    id: 'attendance',
    label: 'Attendance',
    value: '0',
    icon: CheckSquare,
    iconColor: '#2563EB',
    iconBg: '#DBEAFE',
    cardBg: '#EFF6FF',
    border: '#3B82F6',
    valueColor: '#1D4ED8',
    goto: 'attendance' as ViewId,
  },
  {
    id: 'expiring',
    label: 'Expiring',
    value: '3',
    icon: Clock,
    iconColor: '#D97706',
    iconBg: '#FEF3C7',
    cardBg: '#FFFBEB',
    border: '#F59E0B',
    valueColor: '#B45309',
    goto: 'members' as ViewId,
  },
  {
    id: 'expired',
    label: 'Expired',
    value: '40',
    icon: AlertTriangle,
    iconColor: '#DC2626',
    iconBg: '#FEE2E2',
    cardBg: '#FEF2F2',
    border: '#EF4444',
    valueColor: '#B91C1C',
    goto: 'members' as ViewId,
  },
  {
    id: 'collection',
    label: "Today's Collection",
    value: '₹0',
    icon: IndianRupee,
    iconColor: '#0891B2',
    iconBg: '#CFFAFE',
    cardBg: '#ECFEFF',
    border: '#06B6D4',
    valueColor: '#0E7490',
    goto: 'payments' as ViewId,
  },
  {
    id: 'dues',
    label: 'Total Dues',
    value: '₹8,000',
    icon: AlertTriangle,
    iconColor: '#EA580C',
    iconBg: '#FFEDD5',
    cardBg: '#FFF7ED',
    border: '#F97316',
    // The console switches this to red once dues are outstanding.
    valueColor: '#DC2626',
    goto: 'dues' as ViewId,
  },
];

const EXPIRING = [
  { id: 'vd', name: 'Vignesh Das', phone: '919384886895', left: 'Today' },
  { id: 'nv', name: 'Naveen Verma', phone: '919384886895', left: '3d left' },
  { id: 'dn', name: 'Deepa Nair', phone: '919384886895', left: '6d left' },
];

const MEMBERS = [
  { code: 'GF0063', name: 'Vignesh Das', plan: 'Monthly', expires: '15 Jul (2d)', status: 'Expiring' },
  { code: 'GF0043', name: 'Naveen Verma', plan: 'Quarterly', expires: '18 Jul (3d)', status: 'Expiring' },
  { code: 'GF0059', name: 'Aakash Das', plan: 'Annual', expires: '17 Apr 2027', status: 'Active' },
  { code: 'GF0024', name: 'Priya Suresh', plan: 'Annual', expires: '17 May 2027', status: 'Active' },
  { code: 'GF0018', name: 'Karthik R.', plan: 'Monthly', expires: '02 Jun', status: 'Expired' },
];

const PAYMENTS = [
  { id: '#85', name: 'Arun Kumar', plan: 'Quarterly', mode: 'UPI', amount: '₹5,000' },
  { id: '#84', name: 'Priya Suresh', plan: 'Monthly', mode: 'UPI', amount: '₹7,500' },
  { id: '#83', name: 'Ragul M.', plan: 'Annual', mode: 'CASH', amount: '₹7,500' },
  { id: '#82', name: 'Ganesh V.', plan: 'Annual', mode: 'CASH', amount: '₹9,500' },
];

const DUES = [
  { id: '#85', name: 'Arun Kumar', phone: '9876543210', due: '₹1,500' },
  { id: '#83', name: 'Ragul M.', phone: '9384886895', due: '₹3,000' },
  { id: '#82', name: 'Ganesh V.', phone: '9384886895', due: '₹3,500' },
];

const STOCK = [
  { name: 'MuscleBlaze Whey', variant: 'Banana', category: 'Supplements', price: '₹2,500', qty: 10 },
  { name: 'Nakpro Whey', variant: 'Chocolate', category: 'Supplements', price: '₹1,200', qty: 10 },
  { name: 'Shaker Bottle', variant: '700ml', category: 'Accessories', price: '₹350', qty: 24 },
];

const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  Expiring: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  Expired: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
};

function initials(name: string) {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** The canvas is authored at this size and scaled to fit; see index.css. */
const CANVAS_WIDTH = 1160;

export function DashboardMock() {
  const [view, setView] = useState<ViewId>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [reminded, setReminded] = useState<string[]>([]);
  const [expiringOpen, setExpiringOpen] = useState(true);
  const [checkedIn, setCheckedIn] = useState(0);
  const [memberId, setMemberId] = useState('');
  const [scale, setScale] = useState(1);
  const shellRef = useRef<HTMLDivElement>(null);

  // useLayoutEffect, not useEffect: the factor is applied before the browser
  // paints, so the canvas is never briefly visible at its unscaled 1160px.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const fit = (width: number) => {
      if (width > 0) setScale(width / CANVAS_WIDTH);
    };

    fit(shell.getBoundingClientRect().width);

    const observer = new ResizeObserver(entries => {
      fit(entries[0].contentRect.width);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const remind = (id: string) =>
    setReminded(prev => (prev.includes(id) ? prev : [...prev, id]));

  return (
    <div ref={shellRef} className="dash-shell rounded-2xl border border-border-subtle bg-white">
      <div className="dash-canvas" style={{ transform: `scale(${scale})` }} aria-hidden>
        <div className="flex h-full w-full overflow-hidden font-sans text-slate-800">
          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <aside
            className={`flex shrink-0 flex-col border-r border-slate-100 bg-white transition-[width] duration-300 ${
              collapsed ? 'w-[68px]' : 'w-[208px]'
            }`}
          >
            <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-100 px-3">
              {collapsed ? (
                <img
                  src="/logo_only.webp"
                  alt=""
                  width={160}
                  height={160}
                  className="mx-auto h-6 w-6 object-contain"
                />
              ) : (
                <img
                  src="/logo_landspace_without_bg.webp"
                  alt=""
                  width={400}
                  height={178}
                  className="h-[22px] w-auto object-contain"
                />
              )}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setCollapsed(c => !c)}
                className={`grid h-5 w-5 shrink-0 place-items-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 ${
                  collapsed ? 'absolute left-[46px]' : ''
                }`}
              >
                <ChevronLeft
                  className={`h-3.5 w-3.5 transition-transform duration-300 ${
                    collapsed ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            <nav className="flex-1 space-y-0.5 px-2 py-3">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const active = !item.soon && view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    tabIndex={-1}
                    onClick={() => !item.soon && setView(item.id as ViewId)}
                    title={item.soon ? `${item.label} — coming soon` : item.label}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium transition-colors ${
                      active
                        ? 'bg-[#EFF6FF] text-[#2563EB]'
                        : item.soon
                          ? 'cursor-not-allowed text-slate-400'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    <Icon
                      className={`h-[15px] w-[15px] shrink-0 ${
                        active ? 'text-[#2563EB]' : 'text-slate-400'
                      }`}
                      strokeWidth={active ? 2.4 : 2}
                    />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.soon ? (
                          <span className="ml-auto rounded border border-amber-200/60 bg-amber-50 px-1 py-px text-[8px] font-bold tracking-wide text-amber-600">
                            SOON
                          </span>
                        ) : (
                          active && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                          )
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="p-2.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setView('members')}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] py-2 text-[12px] font-semibold text-white shadow-sm shadow-blue-200 transition-transform active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                {!collapsed && 'Add Member'}
              </button>
            </div>
          </aside>

          {/* ── Main ────────────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#F8FAFC]">
            <header className="relative flex h-[52px] shrink-0 items-center justify-center border-b border-slate-100 bg-white px-5">
              <span className="text-[15px] font-extrabold uppercase tracking-tight text-[#2563EB]">
                {GYM_NAME}
              </span>
              <span className="absolute right-5 grid h-7 w-7 place-items-center rounded-full bg-[#EFF6FF] text-[10px] font-bold text-[#1D4ED8]">
                FZ
              </span>
            </header>

            <div className="min-h-0 flex-1 p-5">
              {view === 'dashboard' && (
                <DashboardView
                  reminded={reminded}
                  onRemind={remind}
                  expiringOpen={expiringOpen}
                  onToggleExpiring={() => setExpiringOpen(o => !o)}
                  onGoto={setView}
                />
              )}
              {view === 'members' && <MembersView reminded={reminded} onRemind={remind} />}
              {view === 'payments' && <PaymentsView />}
              {view === 'dues' && <DuesView reminded={reminded} onRemind={remind} />}
              {view === 'attendance' && (
                <AttendanceView
                  checkedIn={checkedIn}
                  memberId={memberId}
                  onMemberId={setMemberId}
                  onConfirm={() => {
                    if (!memberId.trim()) return;
                    setCheckedIn(c => c + 1);
                    setMemberId('');
                  }}
                />
              )}
              {view === 'inventory' && <InventoryView />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function ViewTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="shrink-0">
      <div className="mb-0.5 flex items-center gap-1.5">
        <Dumbbell className="h-3.5 w-3.5 text-[#2563EB]" />
        <span className="text-[10.5px] font-medium text-slate-500">{GYM_NAME}</span>
      </div>
      <h3 className="text-[19px] font-bold tracking-tight text-slate-900">{title}</h3>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_0_rgb(15_23_42/5%)] ${className}`}
    >
      {children}
    </div>
  );
}

function RemindButton({
  sent,
  onClick,
  compact = false,
}: {
  sent: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-white transition-colors ${
        sent ? 'bg-[#047857]' : 'bg-[#10B981] hover:bg-[#059669]'
      }`}
    >
      {sent ? <Check className="h-3 w-3" strokeWidth={3} /> : <MessageCircle className="h-3 w-3" />}
      {sent ? 'Sent' : compact ? '' : 'Remind'}
    </button>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */

function DashboardView({
  reminded,
  onRemind,
  expiringOpen,
  onToggleExpiring,
  onGoto,
}: {
  reminded: string[];
  onRemind: (id: string) => void;
  expiringOpen: boolean;
  onToggleExpiring: () => void;
  onGoto: (v: ViewId) => void;
}) {
  const QUICK_ACTIONS = [
    { label: 'Add New Member', icon: Plus, from: '#2563EB', to: '#1D4ED8', goto: 'members' as ViewId },
    { label: 'Mark Attendance', icon: CalendarCheck, from: '#06B6D4', to: '#0891B2', goto: 'attendance' as ViewId },
    { label: 'Attendance Log', icon: ClipboardList, from: '#6366F1', to: '#4F46E5', goto: 'attendance' as ViewId },
    { label: 'Daily Report PDF', icon: FileText, from: '#10B981', to: '#059669', goto: 'payments' as ViewId },
  ];

  return (
    <div className="flex h-full flex-col">
      <ViewTitle title="Dashboard" />

      <div className="mt-3.5 grid shrink-0 grid-cols-6 gap-2.5">
        {STATS.map(stat => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.id}
              type="button"
              tabIndex={-1}
              onClick={() => onGoto(stat.goto)}
              style={{ backgroundColor: stat.cardBg, borderColor: stat.border }}
              className="rounded-xl border p-2.5 text-left transition-shadow hover:shadow-md"
            >
              <span
                className="mb-1.5 grid h-6 w-6 place-items-center rounded-lg"
                style={{ backgroundColor: stat.iconBg }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: stat.iconColor }} />
              </span>
              <p
                className="text-[17px] font-bold leading-none"
                style={{ color: stat.valueColor }}
              >
                {stat.value}
              </p>
              <p className="mt-1 truncate text-[9.5px] leading-tight text-slate-500">
                {stat.label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 gap-3">
        <Panel className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <button
              type="button"
              tabIndex={-1}
              onClick={onToggleExpiring}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-slate-50"
            >
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[12.5px] font-bold text-slate-900">
                Expiring This Week
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-300 ${
                  expiringOpen ? '' : '-rotate-90'
                }`}
              />
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="text-[11.5px] font-semibold text-[#1D4ED8] hover:underline"
            >
              See all
            </button>
          </div>

          {expiringOpen && (
            <div className="divide-y divide-slate-50">
              {EXPIRING.map(member => (
                <div
                  key={member.id}
                  className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#DBEAFE] to-[#BFDBFE] text-[9.5px] font-bold text-[#1E40AF]">
                    {initials(member.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-slate-900">
                      {member.name}
                    </span>
                    <span className="block text-[10px] text-slate-400">{member.phone}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold text-amber-600">
                    {member.left}
                  </span>
                  <RemindButton
                    sent={reminded.includes(member.id)}
                    onClick={() => onRemind(member.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="flex w-[228px] shrink-0 flex-col bg-gradient-to-b from-white to-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-widest text-slate-400">
            <TrendingUp className="h-3 w-3" />
            Quick Actions
          </p>
          <div className="mt-2.5 flex flex-1 flex-col gap-2">
            {QUICK_ACTIONS.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  tabIndex={-1}
                  onClick={() => onGoto(action.goto)}
                  style={{
                    backgroundImage: `linear-gradient(to right, ${action.from}, ${action.to})`,
                  }}
                  className="flex items-center gap-2 rounded-xl p-2 text-[11px] font-bold text-white transition-transform hover:-translate-y-px active:scale-[0.98]"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/20">
                    <Icon className="h-3 w-3" />
                  </span>
                  {action.label}
                </button>
              );
            })}
            <button
              type="button"
              tabIndex={-1}
              onClick={() => onGoto('dues')}
              className="flex items-center gap-2 rounded-xl border-2 border-red-100 bg-white p-2 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-red-50">
                <IndianRupee className="h-3 w-3" />
              </span>
              View Fee Dues
              <span className="ml-auto rounded-full bg-red-600 px-1.5 py-px text-[9px] text-white">
                ₹8,000
              </span>
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── Members ──────────────────────────────────────────────────────────────── */

function MembersView({
  reminded,
  onRemind,
}: {
  reminded: string[];
  onRemind: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <ViewTitle title="Members" sub="81 total · 44 active · 3 expiring" />

      <div className="mt-3.5 flex shrink-0 items-center gap-2">
        <span className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[11px] text-slate-400">Search by name or phone…</span>
        </span>
        {['All (81)', 'Active (44)', 'Expiring (3)'].map((chip, i) => (
          <button
            key={chip}
            type="button"
            tabIndex={-1}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
              i === 0
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      <Panel className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-[8.5px] font-bold uppercase tracking-widest text-slate-400">
          <span className="w-[62px]">#</span>
          <span className="flex-1">Member</span>
          <span className="w-[76px]">Plan</span>
          <span className="w-[104px]">Expires</span>
          <span className="w-[112px] text-right">Status</span>
        </div>
        <div className="divide-y divide-slate-100">
          {MEMBERS.map(member => (
            <div
              key={member.code}
              className="flex items-center px-4 py-2 transition-colors hover:bg-slate-50/60"
            >
              <span className="w-[62px] text-[9.5px] font-medium text-slate-400">
                {member.code}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#DBEAFE] to-[#BFDBFE] text-[9px] font-bold text-[#1E40AF]">
                  {initials(member.name)}
                </span>
                <span className="truncate text-[11.5px] font-semibold text-slate-800">
                  {member.name}
                </span>
              </span>
              <span className="w-[76px] text-[11px] text-slate-600">{member.plan}</span>
              <span className="w-[104px] text-[10.5px] text-slate-500">{member.expires}</span>
              <span className="flex w-[112px] items-center justify-end gap-1.5">
                <span
                  className={`rounded border px-1.5 py-px text-[9px] font-bold ${
                    STATUS_STYLES[member.status]
                  }`}
                >
                  {member.status}
                </span>
                {member.status === 'Expiring' && (
                  <RemindButton
                    sent={reminded.includes(member.code)}
                    onClick={() => onRemind(member.code)}
                    compact
                  />
                )}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ── Payments ─────────────────────────────────────────────────────────────── */

function PaymentsView() {
  return (
    <div className="flex h-full flex-col">
      <ViewTitle title="Payments" />

      <div className="mt-3.5 flex shrink-0 items-center justify-between rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] p-4 text-white">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/70">
            This month&apos;s collection
          </p>
          <p className="mt-1.5 text-[30px] font-bold leading-none">₹34,500</p>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-white/85">
            <span>
              Cash <strong className="text-white">₹22,000</strong>
            </span>
            <span>
              UPI <strong className="text-white">₹12,500</strong>
            </span>
            <span className="text-white/60">4 transactions</span>
          </div>
        </div>
        <div className="space-y-1 text-right text-[10.5px]">
          <p>
            Memberships <strong>₹34,500</strong>
          </p>
          <p>
            Inventory <strong>₹0</strong>
          </p>
          <p>
            Dues collected <strong>₹0</strong>
          </p>
        </div>
      </div>

      <Panel className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-[8.5px] font-bold uppercase tracking-widest text-slate-400">
          <span className="w-[44px]">#</span>
          <span className="flex-1">Member</span>
          <span className="w-[84px]">Plan</span>
          <span className="w-[70px]">Mode</span>
          <span className="w-[74px] text-right">Amount</span>
        </div>
        <div className="divide-y divide-slate-100">
          {PAYMENTS.map(payment => (
            <div
              key={payment.id}
              className="flex items-center px-4 py-2.5 transition-colors hover:bg-slate-50/60"
            >
              <span className="w-[44px] text-[9.5px] font-bold text-slate-400">
                {payment.id}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-800">
                {payment.name}
              </span>
              <span className="w-[84px] text-[11px] text-slate-600">{payment.plan}</span>
              <span className="w-[70px]">
                <span
                  className={`rounded border px-1.5 py-px text-[9px] font-bold uppercase ${
                    payment.mode === 'CASH'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                      : 'border-blue-200 bg-blue-50 text-[#1D4ED8]'
                  }`}
                >
                  {payment.mode}
                </span>
              </span>
              <span className="w-[74px] text-right text-[12px] font-bold text-slate-900">
                {payment.amount}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ── Dues ─────────────────────────────────────────────────────────────────── */

function DuesView({
  reminded,
  onRemind,
}: {
  reminded: string[];
  onRemind: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between">
        <ViewTitle title="Fee Dues" />
        <Panel className="flex items-center gap-2 px-3 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
          <span className="text-right">
            <span className="block text-[8.5px] font-semibold uppercase tracking-widest text-slate-400">
              Total pending
            </span>
            <span className="block text-[13px] font-bold leading-none text-red-600">
              ₹8,000
            </span>
          </span>
        </Panel>
      </div>

      <div className="mt-3.5 flex min-h-0 flex-1 flex-col gap-2.5">
        {DUES.map(item => (
          <Panel
            key={item.id}
            className="flex shrink-0 items-center justify-between p-3 transition-colors hover:border-slate-300"
          >
            <span className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-red-50 text-[12px] font-bold text-red-500">
                {initials(item.name)}
              </span>
              <span>
                <span className="block text-[12px] font-bold text-slate-800">
                  {item.name}
                  <span className="ml-1.5 text-[9.5px] font-medium text-slate-400">
                    {item.id}
                  </span>
                </span>
                <span className="block text-[10.5px] text-slate-500">{item.phone}</span>
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-right">
                <span className="block text-[13px] font-bold leading-none text-red-600">
                  {item.due}
                </span>
                <span className="block text-[9.5px] text-slate-400">pending</span>
              </span>
              <RemindButton
                sent={reminded.includes(item.id)}
                onClick={() => onRemind(item.id)}
                compact
              />
              <button
                type="button"
                tabIndex={-1}
                className="grid h-6 w-6 place-items-center rounded bg-[#2563EB] text-[11px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
              >
                ₹
              </button>
            </span>
          </Panel>
        ))}
      </div>
    </div>
  );
}

/* ── Attendance ───────────────────────────────────────────────────────────── */

function AttendanceView({
  checkedIn,
  memberId,
  onMemberId,
  onConfirm,
}: {
  checkedIn: number;
  memberId: string;
  onMemberId: (v: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="w-full max-w-[340px] text-center">
        <h3 className="text-[26px] font-bold leading-none tracking-tight text-slate-900">
          {GYM_NAME}
        </h3>
        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Self-service attendance
        </p>

        <p className="mt-6 text-[9.5px] font-bold uppercase tracking-widest text-slate-400">
          Enter your member ID
        </p>
        <input
          type="text"
          inputMode="numeric"
          tabIndex={-1}
          value={memberId}
          onChange={event => onMemberId(event.target.value.replace(/\D/g, '').slice(0, 5))}
          onKeyDown={event => event.key === 'Enter' && onConfirm()}
          placeholder="1042"
          className="mt-1.5 w-full border-b-2 border-[#2563EB] bg-transparent pb-1 text-center text-[38px] font-bold text-slate-800 outline-none placeholder:text-slate-200"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={onConfirm}
          disabled={!memberId.trim()}
          className="mx-auto mt-5 block w-[190px] rounded-full bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] py-2.5 text-[13px] font-bold text-white shadow-sm transition-all hover:-translate-y-px disabled:translate-y-0 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
        >
          Confirm
        </button>

        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400">
            Checked in today
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-[12px] font-bold text-slate-700">
            {checkedIn}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Inventory ────────────────────────────────────────────────────────────── */

function InventoryView() {
  return (
    <div className="flex h-full flex-col">
      <ViewTitle title="Inventory" sub="Products, stock and pricing" />

      <Panel className="mt-3.5 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-[8.5px] font-bold uppercase tracking-widest text-slate-400">
          <span className="flex-1">Product</span>
          <span className="w-[96px]">Category</span>
          <span className="w-[66px]">Price</span>
          <span className="w-[92px] text-right">Stock</span>
        </div>
        <div className="divide-y divide-slate-100">
          {STOCK.map(item => (
            <div
              key={item.name}
              className="flex items-center px-4 py-2.5 transition-colors hover:bg-slate-50/60"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                  <Package className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-bold text-slate-800">
                    {item.name}
                  </span>
                  <span className="block text-[10px] text-slate-500">{item.variant}</span>
                </span>
              </span>
              <span className="w-[96px] text-[10.5px] text-slate-500">{item.category}</span>
              <span className="w-[66px] text-[12px] font-bold text-slate-800">
                {item.price}
              </span>
              <span className="w-[92px] text-right">
                <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-[8.5px] font-extrabold uppercase tracking-widest text-emerald-600">
                  {item.qty} in stock
                </span>
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
