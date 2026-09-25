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

/*
  Exact palettes from the console's StatCard calls, light and dark.

  Class pairs rather than the hex values these used to hold, because those were
  applied through an inline `style` and an inline declaration cannot be overridden
  by a `dark:` variant — it wins the cascade outright. Tailwind sees these strings
  as literal source text, so both halves compile.

  The dark column is not a darkened version of the light one. The console drops the
  tint from the card entirely in dark and keeps the tone only in the icon chip and
  the number: six tinted cards that read as crisp pastels on white turn into six
  muddy brown-greens on near-black, which is exactly the complaint that drove the
  console to this treatment. So the card goes neutral and the colour moves to where
  it still reads.

  Steps are the console's own: chip is the family's 200, glyph its 600, number its
  700, all from the dark ramp in app/theme.css.
*/
const STATS = [
  {
    id: 'active',
    label: 'Active',
    value: '44',
    icon: Users,
    card: 'bg-[#F0FDF4] dark:bg-dash-surface',
    edge: '#22C55E',
    chip: 'bg-[#DCFCE7] dark:bg-[#14532D]',
    glyph: 'text-[#16A34A] dark:text-[#4ADE80]',
    ink: 'text-[#15803D] dark:text-[#86EFAC]',
    goto: 'members' as ViewId,
  },
  {
    id: 'attendance',
    label: 'Attendance',
    value: '0',
    icon: CheckSquare,
    card: 'bg-[#EFF6FF] dark:bg-dash-surface',
    edge: '#3B82F6',
    chip: 'bg-[#DBEAFE] dark:bg-[#1E3A8A]',
    glyph: 'text-[#2563EB] dark:text-[#60A5FA]',
    ink: 'text-[#1D4ED8] dark:text-[#93C5FD]',
    goto: 'attendance' as ViewId,
  },
  {
    id: 'expiring',
    label: 'Expiring',
    value: '3',
    icon: Clock,
    card: 'bg-[#FFFBEB] dark:bg-dash-surface',
    edge: '#F59E0B',
    chip: 'bg-[#FEF3C7] dark:bg-[#78350F]',
    glyph: 'text-[#D97706] dark:text-[#FBBF24]',
    ink: 'text-[#B45309] dark:text-[#FCD34D]',
    goto: 'members' as ViewId,
  },
  {
    id: 'expired',
    label: 'Expired',
    value: '40',
    icon: AlertTriangle,
    card: 'bg-[#FEF2F2] dark:bg-dash-surface',
    edge: '#EF4444',
    chip: 'bg-[#FEE2E2] dark:bg-[#7F1D1D]',
    glyph: 'text-[#DC2626] dark:text-[#F87171]',
    ink: 'text-[#B91C1C] dark:text-[#FCA5A5]',
    goto: 'members' as ViewId,
  },
  {
    id: 'collection',
    label: "Today's Collection",
    value: '₹0',
    icon: IndianRupee,
    card: 'bg-[#ECFEFF] dark:bg-dash-surface',
    edge: '#06B6D4',
    chip: 'bg-[#CFFAFE] dark:bg-[#164E63]',
    glyph: 'text-[#0891B2] dark:text-[#22D3EE]',
    ink: 'text-[#0E7490] dark:text-[#67E8F9]',
    goto: 'payments' as ViewId,
  },
  {
    id: 'dues',
    label: 'Total Dues',
    value: '₹8,000',
    icon: AlertTriangle,
    card: 'bg-[#FFF7ED] dark:bg-dash-surface',
    edge: '#F97316',
    chip: 'bg-[#FFEDD5] dark:bg-[#7C2D12]',
    glyph: 'text-[#EA580C] dark:text-[#FB923C]',
    // The console switches the number to red once dues are outstanding, so this
    // one breaks the pattern and takes red's steps while the chip stays orange.
    ink: 'text-[#DC2626] dark:text-[#FCA5A5]',
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

/* Membership status pills. Unlike the stat cards these keep their tint in dark —
   they are small and rely on the fill to be read at a glance, so going neutral
   would leave three identical grey chips separable only by reading the label.
   The dark fills are each family's 100 step, one below the stat chips' 200, so a
   pill inside a table row still reads as quieter than a card. */
const STATUS_STYLES: Record<string, string> = {
  Active:
    'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0] dark:bg-[#022C22] dark:text-[#6EE7B7] dark:border-[#064E3B]',
  Expiring:
    'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A] dark:bg-[#451A03] dark:text-[#FCD34D] dark:border-[#78350F]',
  Expired:
    'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA] dark:bg-[#450A0A] dark:text-[#FCA5A5] dark:border-[#7F1D1D]',
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
    <div ref={shellRef} className="dash-shell rounded-2xl border border-border-subtle bg-dash-surface">
      <div className="dash-canvas" style={{ transform: `scale(${scale})` }} aria-hidden>
        <div className="flex h-full w-full overflow-hidden font-sans text-dash-ink-soft">
          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <aside
            className={`flex shrink-0 flex-col border-r border-dash-line bg-dash-surface transition-[width] duration-300 ${
              collapsed ? 'w-[68px]' : 'w-[208px]'
            }`}
          >
            <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-dash-line px-3">
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
                className={`grid h-5 w-5 shrink-0 place-items-center rounded text-dash-ink-faint transition-colors hover:bg-dash-raise hover:text-dash-ink-dim ${
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
                        ? 'bg-dash-accent-soft text-dash-accent-text'
                        : item.soon
                          ? 'cursor-not-allowed text-dash-ink-faint'
                          : 'text-dash-ink-muted hover:bg-dash-hover hover:text-dash-ink-dim'
                    }`}
                  >
                    <Icon
                      className={`h-[15px] w-[15px] shrink-0 ${
                        active ? 'text-dash-accent-text' : 'text-dash-ink-faint'
                      }`}
                      strokeWidth={active ? 2.4 : 2}
                    />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.soon ? (
                          <span className="ml-auto rounded border border-amber-200/60 bg-amber-50 px-1 py-px text-[8px] font-bold tracking-wide text-amber-600 dark:border-[#78350F] dark:bg-[#451A03] dark:text-[#FCD34D]">
                            SOON
                          </span>
                        ) : (
                          active && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-dash-accent" />
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
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] py-2 text-[12px] font-semibold text-white shadow-sm shadow-blue-200 dark:shadow-none transition-transform active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                {!collapsed && 'Add Member'}
              </button>
            </div>
          </aside>

          {/* ── Main ────────────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col bg-dash-page">
            <header className="relative flex h-[52px] shrink-0 items-center justify-center border-b border-dash-line bg-dash-surface px-5">
              <span className="text-[15px] font-extrabold uppercase tracking-tight text-dash-accent-text">
                {GYM_NAME}
              </span>
              <span className="absolute right-5 grid h-7 w-7 place-items-center rounded-full bg-dash-accent-soft text-[10px] font-bold text-dash-accent-strong">
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
        <Dumbbell className="h-3.5 w-3.5 text-dash-accent-text" />
        <span className="text-[10.5px] font-medium text-dash-ink-muted">{GYM_NAME}</span>
      </div>
      {/* p, not h3. This is chrome inside a decorative product preview, so it has
          no place in the page's heading outline — as an h3 directly after the
          hero's h1 it created a 1 -> 3 level jump. Tailwind Preflight resets
          margins on both elements, so nothing moves visually. */}
      <p className="text-[19px] font-bold tracking-tight text-dash-ink">{title}</p>
      {sub && <p className="mt-0.5 text-[11px] text-dash-ink-faint">{sub}</p>}
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
      // The drop shadow is dropped in dark: a dark shadow on a near-black surface does
      // nothing but muddy the lower edge, and the border already separates the panel.
      className={`rounded-xl border border-dash-border bg-dash-surface shadow-[0_1px_2px_0_rgb(15_23_42/5%)] dark:shadow-none ${className}`}
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
  /*
    Tailwind gradient classes rather than the from/to hex pair these used to carry,
    for the same reason the stat cards changed: the pair was composed into an inline
    `backgroundImage`, which no `dark:` variant can override.

    Dark switches the gradient off with `bg-none` and drops all five onto one
    elevated neutral, keeping the tone in the glyph. Four saturated gradients
    stacked in a column read as a neon strip against a near-black panel — louder
    than the data they sit beside — and this is the treatment the console settled on
    after the same problem. Tinting each button with its own family is not the
    alternative it appears to be: brand's dark tint is #0D1533, whose luminance is
    within a fraction of a percent of the #262626 surface, so the primary would
    separate from its own container by hue alone.

    The primary is ranked by a saturated hairline instead of a fill — one pixel of
    brand blue, no glare.
  */
  const QUICK_ACTIONS = [
    {
      label: 'Add New Member',
      icon: Plus,
      goto: 'members' as ViewId,
      tone: 'bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] dark:bg-none dark:bg-dash-raise dark:border dark:border-dash-accent',
      glyph: 'dark:text-[#60A5FA]',
    },
    {
      label: 'Mark Attendance',
      icon: CalendarCheck,
      goto: 'attendance' as ViewId,
      tone: 'bg-gradient-to-r from-[#06B6D4] to-[#0891B2] dark:bg-none dark:bg-dash-raise dark:border dark:border-[#404040]',
      glyph: 'dark:text-[#22D3EE]',
    },
    {
      label: 'Attendance Log',
      icon: ClipboardList,
      goto: 'attendance' as ViewId,
      tone: 'bg-gradient-to-r from-[#6366F1] to-[#4F46E5] dark:bg-none dark:bg-dash-raise dark:border dark:border-[#404040]',
      glyph: 'dark:text-[#818CF8]',
    },
    {
      label: 'Daily Report PDF',
      icon: FileText,
      goto: 'payments' as ViewId,
      tone: 'bg-gradient-to-r from-[#10B981] to-[#059669] dark:bg-none dark:bg-dash-raise dark:border dark:border-[#404040]',
      glyph: 'dark:text-[#34D399]',
    },
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
              /*
                The border has to be an inline style, not a `border-[#...]` utility. The
                `* { border-color: var(--border) }` rule in index.css is unlayered, and
                unlayered CSS outranks @layer utilities, so a border-colour utility here
                renders as the site's neutral border instead of the card's tone. The
                theme override still works because the value is a var with the tone as
                its fallback; .dark defines --dash-stat-edge and takes all six neutral.
              */
              style={{ borderColor: `var(--dash-stat-edge, ${stat.edge})` }}
              className={`rounded-xl border p-2.5 text-left transition-shadow hover:shadow-md dark:hover:shadow-none ${stat.card}`}
            >
              <span className={`mb-1.5 grid h-6 w-6 place-items-center rounded-lg ${stat.chip}`}>
                <Icon className={`h-3.5 w-3.5 ${stat.glyph}`} />
              </span>
              <p className={`text-[17px] font-bold leading-none ${stat.ink}`}>{stat.value}</p>
              <p className="mt-1 truncate text-[9.5px] leading-tight text-dash-ink-muted">
                {stat.label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 gap-3">
        <Panel className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-dash-line px-4 py-2.5">
            <button
              type="button"
              tabIndex={-1}
              onClick={onToggleExpiring}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-dash-hover"
            >
              <Clock className="h-3.5 w-3.5 text-amber-500 dark:text-[#FBBF24]" />
              <span className="text-[12.5px] font-bold text-dash-ink">
                Expiring This Week
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-dash-ink-faint transition-transform duration-300 ${
                  expiringOpen ? '' : '-rotate-90'
                }`}
              />
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="text-[11.5px] font-semibold text-dash-accent-strong hover:underline"
            >
              See all
            </button>
          </div>

          {expiringOpen && (
            <div className="divide-y divide-dash-line">
              {EXPIRING.map(member => (
                <div
                  key={member.id}
                  className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-dash-hover"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#DBEAFE] to-[#BFDBFE] dark:from-[#172554] dark:to-[#1E3A8A] text-[9.5px] font-bold text-[#1E40AF] dark:text-[#93C5FD]">
                    {initials(member.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-dash-ink">
                      {member.name}
                    </span>
                    <span className="block text-[10px] text-dash-ink-faint">{member.phone}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-[#FCD34D]">
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

        <Panel className="flex w-[228px] shrink-0 flex-col bg-gradient-to-b from-dash-surface to-dash-hover p-3">
          <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-widest text-dash-ink-faint">
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
                  className={`flex items-center gap-2 rounded-xl p-2 text-[11px] font-bold text-white transition-transform hover:-translate-y-px active:scale-[0.98] ${action.tone}`}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/20 dark:bg-white/10">
                    <Icon className={`h-3 w-3 ${action.glyph}`} />
                  </span>
                  {action.label}
                </button>
              );
            })}
            <button
              type="button"
              tabIndex={-1}
              onClick={() => onGoto('dues')}
              // Outlined in light, so in dark it needs the same lift as the four above:
              // its light `bg-dash-surface` is the same value as the panel behind it there.
              // `dark:border` also trims the light `border-2` back to 1px so this button
              // does not carry a visibly thicker edge than its neighbours.
              className="flex items-center gap-2 rounded-xl border-2 border-red-100 bg-dash-surface p-2 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50 dark:border dark:border-[#404040] dark:bg-dash-raise dark:text-[#FCA5A5] dark:hover:bg-[#2A2A2A]"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-red-50 dark:bg-white/10">
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
        <span className="flex flex-1 items-center gap-2 rounded-lg border border-dash-border bg-dash-surface px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-dash-ink-faint" />
          <span className="text-[11px] text-dash-ink-faint">Search by name or phone…</span>
        </span>
        {['All (81)', 'Active (44)', 'Expiring (3)'].map((chip, i) => (
          <button
            key={chip}
            type="button"
            tabIndex={-1}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
              i === 0
                ? // Inverts in dark, the way the console's own selected filter chip does:
                  // a near-black pill would vanish into a near-black panel.
                  'bg-slate-900 text-white dark:bg-[#F5F5F5] dark:text-[#0A0A0A]'
                : 'border border-dash-border bg-dash-surface text-dash-ink-dim hover:bg-dash-hover'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      <Panel className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center border-b border-dash-border bg-dash-hover px-4 py-2 text-[8.5px] font-bold uppercase tracking-widest text-dash-ink-faint">
          <span className="w-[62px]">#</span>
          <span className="flex-1">Member</span>
          <span className="w-[76px]">Plan</span>
          <span className="w-[104px]">Expires</span>
          <span className="w-[112px] text-right">Status</span>
        </div>
        <div className="divide-y divide-dash-line">
          {MEMBERS.map(member => (
            <div
              key={member.code}
              className="flex items-center px-4 py-2 transition-colors hover:bg-dash-hover"
            >
              <span className="w-[62px] text-[9.5px] font-medium text-dash-ink-faint">
                {member.code}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#DBEAFE] to-[#BFDBFE] dark:from-[#172554] dark:to-[#1E3A8A] text-[9px] font-bold text-[#1E40AF] dark:text-[#93C5FD]">
                  {initials(member.name)}
                </span>
                <span className="truncate text-[11.5px] font-semibold text-dash-ink-soft">
                  {member.name}
                </span>
              </span>
              <span className="w-[76px] text-[11px] text-dash-ink-dim">{member.plan}</span>
              <span className="w-[104px] text-[10.5px] text-dash-ink-muted">{member.expires}</span>
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
        <div className="flex shrink-0 items-center border-b border-dash-border bg-dash-hover px-4 py-2 text-[8.5px] font-bold uppercase tracking-widest text-dash-ink-faint">
          <span className="w-[44px]">#</span>
          <span className="flex-1">Member</span>
          <span className="w-[84px]">Plan</span>
          <span className="w-[70px]">Mode</span>
          <span className="w-[74px] text-right">Amount</span>
        </div>
        <div className="divide-y divide-dash-line">
          {PAYMENTS.map(payment => (
            <div
              key={payment.id}
              className="flex items-center px-4 py-2.5 transition-colors hover:bg-dash-hover"
            >
              <span className="w-[44px] text-[9.5px] font-bold text-dash-ink-faint">
                {payment.id}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-dash-ink-soft">
                {payment.name}
              </span>
              <span className="w-[84px] text-[11px] text-dash-ink-dim">{payment.plan}</span>
              <span className="w-[70px]">
                <span
                  className={`rounded border px-1.5 py-px text-[9px] font-bold uppercase ${
                    payment.mode === 'CASH'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-[#064E3B] dark:bg-[#022C22] dark:text-[#6EE7B7]'
                      : 'border-blue-200 bg-blue-50 text-dash-accent-strong dark:border-[#1E3A8A] dark:bg-[#172554]'
                  }`}
                >
                  {payment.mode}
                </span>
              </span>
              <span className="w-[74px] text-right text-[12px] font-bold text-dash-ink">
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
          <AlertCircle className="h-3.5 w-3.5 text-red-500 dark:text-[#F87171]" />
          <span className="text-right">
            <span className="block text-[8.5px] font-semibold uppercase tracking-widest text-dash-ink-faint">
              Total pending
            </span>
            <span className="block text-[13px] font-bold leading-none text-red-600 dark:text-[#FCA5A5]">
              ₹8,000
            </span>
          </span>
        </Panel>
      </div>

      <div className="mt-3.5 flex min-h-0 flex-1 flex-col gap-2.5">
        {DUES.map(item => (
          <Panel
            key={item.id}
            className="flex shrink-0 items-center justify-between p-3 transition-colors hover:border-slate-300 dark:hover:border-[#404040]"
          >
            <span className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-red-50 dark:bg-[#450A0A] text-[12px] font-bold text-red-500 dark:text-[#F87171]">
                {initials(item.name)}
              </span>
              <span>
                <span className="block text-[12px] font-bold text-dash-ink-soft">
                  {item.name}
                  <span className="ml-1.5 text-[9.5px] font-medium text-dash-ink-faint">
                    {item.id}
                  </span>
                </span>
                <span className="block text-[10.5px] text-dash-ink-muted">{item.phone}</span>
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-right">
                <span className="block text-[13px] font-bold leading-none text-red-600 dark:text-[#FCA5A5]">
                  {item.due}
                </span>
                <span className="block text-[9.5px] text-dash-ink-faint">pending</span>
              </span>
              <RemindButton
                sent={reminded.includes(item.id)}
                onClick={() => onRemind(item.id)}
                compact
              />
              <button
                type="button"
                tabIndex={-1}
                className="grid h-6 w-6 place-items-center rounded bg-dash-accent text-[11px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
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
        {/* p, not h3 — mock chrome, same reasoning as the panel title above. */}
        <p className="text-[26px] font-bold leading-none tracking-tight text-dash-ink">
          {GYM_NAME}
        </p>
        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-dash-ink-muted">
          Self-service attendance
        </p>

        <p className="mt-6 text-[9.5px] font-bold uppercase tracking-widest text-dash-ink-faint">
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
          className="mt-1.5 w-full border-b-2 border-dash-accent bg-transparent pb-1 text-center text-[38px] font-bold text-dash-ink-soft outline-none placeholder:text-slate-200 dark:placeholder:text-[#333333]"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={onConfirm}
          disabled={!memberId.trim()}
          className="mx-auto mt-5 block w-[190px] rounded-full bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] py-2.5 text-[13px] font-bold text-white shadow-sm transition-all hover:-translate-y-px disabled:translate-y-0 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none dark:disabled:from-[#404040] dark:disabled:to-[#404040]"
        >
          Confirm
        </button>

        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="text-[11px] font-semibold text-dash-ink-faint">
            Checked in today
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-full border border-dash-border bg-dash-surface text-[12px] font-bold text-dash-ink-dim">
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
        <div className="flex shrink-0 items-center border-b border-dash-border bg-dash-hover px-4 py-2 text-[8.5px] font-bold uppercase tracking-widest text-dash-ink-faint">
          <span className="flex-1">Product</span>
          <span className="w-[96px]">Category</span>
          <span className="w-[66px]">Price</span>
          <span className="w-[92px] text-right">Stock</span>
        </div>
        <div className="divide-y divide-dash-line">
          {STOCK.map(item => (
            <div
              key={item.name}
              className="flex items-center px-4 py-2.5 transition-colors hover:bg-dash-hover"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-dash-line bg-dash-hover text-slate-300 dark:text-[#525252]">
                  <Package className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-bold text-dash-ink-soft">
                    {item.name}
                  </span>
                  <span className="block text-[10px] text-dash-ink-muted">{item.variant}</span>
                </span>
              </span>
              <span className="w-[96px] text-[10.5px] text-dash-ink-muted">{item.category}</span>
              <span className="w-[66px] text-[12px] font-bold text-dash-ink-soft">
                {item.price}
              </span>
              <span className="w-[92px] text-right">
                <span className="rounded-full bg-[#ECFDF5] dark:bg-[#022C22] px-2 py-1 text-[8.5px] font-extrabold uppercase tracking-widest text-emerald-600 dark:text-[#6EE7B7]">
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
