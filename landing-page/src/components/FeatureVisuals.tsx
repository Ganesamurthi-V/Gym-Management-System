/* One illustration per tab of the features switcher, so the section never repeats the dashboard mock shown in the dark band above it.
   Sample data only, and only names and figures the page already shows (HeroDemo, DashboardMock). Decorative: aria-hidden, no focus targets;
   the switcher supplies the real text. Tokens only, so light and night both work. */
import { Search, Check, Delete } from 'lucide-react';

const PANEL = 'rounded-[14px] border border-border-subtle bg-background';

type Status = 'active' | 'expiring' | 'expired';
const STATUS_LABEL: Record<Status, string> = { active: 'Active', expiring: 'Expiring', expired: 'Expired' };

const MEMBERS: { id: string; name: string; plan: string; status: Status; note?: string }[] = [
  { id: 'GF0012', name: 'Ravi Kumar', plan: 'Monthly', status: 'expired', note: 'Ended 24 Oct' },
  { id: 'GF0031', name: 'Priya Sharma', plan: 'Quarterly', status: 'expiring', note: '5 days left' },
  { id: 'GF0047', name: 'Arjun Menon', plan: 'Annual', status: 'active' },
  { id: 'GF0052', name: 'Fathima R.', plan: 'Monthly', status: 'active', note: '₹500 pending' },
];

function Initials({ name }: { name: string }) {
  const letters = name
    .replace('.', '')
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2);
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-[13px] font-semibold text-muted-foreground">
      {letters}
    </span>
  );
}

/** Tab 1: the searchable member list with one record opened beside it. */
export function MembersVisual() {
  const open = MEMBERS[1];
  return (
    <div aria-hidden className="pointer-events-none grid min-h-[420px] select-none gap-6 p-5 md:grid-cols-[1.15fr_1fr] md:p-8">
      <div className={`${PANEL} p-4`}>
        <div className="flex items-center gap-2 rounded-[10px] border border-border-strong bg-frame px-3 py-2.5 text-[15px] text-muted-foreground">
          <Search className="h-4 w-4" strokeWidth={2} />
          Search by name or member ID
        </div>
        <ul className="mt-3">
          {MEMBERS.map(m => (
            <li
              key={m.id}
              className={`flex items-center gap-3 border-t border-border-subtle py-3 first:border-t-0 ${m.id === open.id ? 'rounded-[10px] bg-accent-soft px-3' : ''}`}
            >
              <Initials name={m.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[16px] font-medium text-foreground">{m.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {m.id}, {m.plan}
                </span>
              </span>
              <span className={`status-chip status-${m.status}`}>{STATUS_LABEL[m.status]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${PANEL} flex flex-col p-6`}>
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-[18px] font-semibold text-accent-ink">PS</span>
          <span>
            <span className="block font-display text-[22px] font-semibold leading-tight text-foreground">{open.name}</span>
            <span className="block text-[14px] text-muted-foreground">{open.id}</span>
          </span>
        </div>
        <dl className="mt-6 divide-y divide-border-subtle text-[15px]">
          <div className="flex justify-between py-3">
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-medium text-foreground">{open.plan}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <span className={`status-chip status-${open.status}`}>{STATUS_LABEL[open.status]}</span>
            </dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-muted-foreground">Expires</dt>
            <dd className="font-medium text-foreground">{open.note}</dd>
          </div>
        </dl>
        <span className="btn btn-primary mt-auto self-start">Renew plan</span>
      </div>
    </div>
  );
}

/** Tab 2: recording a part payment, and the member who still owes. */
export function DuesVisual() {
  const modes = ['Cash', 'UPI', 'Card'];
  return (
    <div aria-hidden className="pointer-events-none grid min-h-[420px] select-none gap-6 p-5 md:grid-cols-[1fr_1.1fr] md:p-8">
      <div className={`${PANEL} flex flex-col p-6`}>
        <p className="font-display text-[20px] font-semibold text-foreground">Record a payment</p>
        <p className="mt-1 text-[14px] text-muted-foreground">Fathima R., GF0052, Monthly</p>

        <p className="mt-6 text-[14px] text-muted-foreground">Amount received</p>
        <div className="mt-2 rounded-[10px] border border-border-strong bg-frame px-4 py-3 font-display text-[28px] font-semibold text-foreground">
          ₹500
        </div>

        <p className="mt-5 text-[14px] text-muted-foreground">Paid by</p>
        <div className="mt-2 flex gap-2">
          {modes.map(mode => (
            <span key={mode} className={`btn ${mode === 'UPI' ? 'btn-primary' : 'btn-outline'} flex-1 justify-center`}>
              {mode}
            </span>
          ))}
        </div>
        <div className="mt-auto pt-6">
          <span className="btn btn-primary">Record payment</span>
        </div>
      </div>

      <div className={`${PANEL} p-6`}>
        <p className="font-display text-[20px] font-semibold text-foreground">Who owes what</p>
        <ul className="mt-4">
          <li className="flex items-center gap-3 rounded-[10px] bg-accent-soft px-3 py-3">
            <Initials name="Fathima R." />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[16px] font-medium text-foreground">Fathima R.</span>
              <span className="block text-[13px] text-muted-foreground">GF0052, Monthly</span>
            </span>
            <span className="text-right font-display text-[18px] font-semibold text-foreground">₹500</span>
          </li>
        </ul>
        <p className="mt-5 max-w-[38ch] text-[15px] text-muted-foreground">
          A part payment stays on the member as a pending due, until the rest is recorded.
        </p>
        <span className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-subtle px-3 py-2 text-[14px] text-muted-foreground">
          <Check className="h-4 w-4 text-accent-text" strokeWidth={2.5} />
          Cash, UPI and card payments in rupees
        </span>
      </div>
    </div>
  );
}

/** Tab 3: the front-desk check-in, as the member-ID keypad. */
export function AttendanceVisual() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'GF', '0'];
  return (
    <div aria-hidden className="pointer-events-none grid min-h-[420px] select-none gap-6 p-5 md:grid-cols-[1fr_1fr] md:p-8">
      <div className={`${PANEL} flex flex-col items-center p-6 text-center`}>
        <p className="font-display text-[20px] font-semibold text-foreground">Enter your member ID</p>
        <div className="mt-4 w-full max-w-[300px] rounded-[10px] border border-border-strong bg-frame px-4 py-3 font-mono text-[26px] font-medium tracking-wide text-foreground">
          GF0047
        </div>
        <div className="mt-5 grid w-full max-w-[300px] grid-cols-3 gap-2">
          {keys.map(key => (
            <span key={key} className="btn btn-outline justify-center">
              {key}
            </span>
          ))}
          <span className="btn btn-outline justify-center">
            <Delete className="h-5 w-5" strokeWidth={2} />
          </span>
        </div>
      </div>

      <div className={`${PANEL} flex flex-col p-6`}>
        <p className="font-display text-[20px] font-semibold text-foreground">Checked in</p>
        <div className="mt-4 flex items-center gap-4 rounded-[10px] bg-accent-soft p-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink">
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </span>
          <span>
            <span className="block font-display text-[20px] font-semibold text-foreground">Arjun Menon</span>
            <span className="block text-[14px] text-muted-foreground">GF0047, Annual</span>
          </span>
        </div>
        <span className="status-chip status-active mt-4 self-start">Active</span>
        <p className="mt-auto max-w-[36ch] pt-6 text-[15px] text-muted-foreground">
          Members check in at the front desk, or on their own with their member ID.
        </p>
      </div>
    </div>
  );
}
