import { useState } from 'react';
import { Bell, Check, Download, Pin, Plus, Send, Trophy, X } from 'lucide-react';
import { Panel, ViewTitle, initials } from './shared';

/*
  The owner console's newer pages: Renewals, Reports, Member App and Notices.
  Headings, columns and chips follow app/owner/renewals, app/owner/reports,
  features/member-app and app/owner/notices; every name and number is sample data.
*/

const PILL = 'rounded border px-1.5 py-px text-[11px] font-bold';
const PILL_GREEN =
  'border-dash-emerald-200 bg-dash-emerald-50 text-dash-emerald-700 dark:border-dash-emerald-900 dark:bg-dash-emerald-950 dark:text-dash-emerald-300';
const PILL_AMBER =
  'border-dash-amber-200 bg-dash-amber-50 text-dash-amber-700 dark:border-dash-amber-900 dark:bg-dash-amber-950 dark:text-dash-amber-300';
const PILL_RED =
  'border-dash-red-200 bg-dash-red-50 text-dash-red-700 dark:border-dash-red-900 dark:bg-dash-red-950 dark:text-dash-red-300';
const PILL_BLUE =
  'border-dash-blue-200 bg-dash-blue-50 text-dash-accent-strong dark:border-dash-blue-900 dark:bg-dash-blue-950';

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-dash-blue-100 text-[11px] font-bold text-dash-blue-800 dark:bg-dash-blue-950 dark:text-dash-blue-300">
      {initials(name)}
    </span>
  );
}

/* ── Renewals ─────────────────────────────────────────────────────────────── */

export const RENEWALS = [
  { id: 'r1', code: 'GF0063', name: 'Vignesh Das', plan: 'Monthly', duration: '1 month', amount: '₹1,500', proof: 'UPI ref 4128 3391 7720' },
  { id: 'r2', code: 'GF0043', name: 'Naveen Verma', plan: 'Quarterly', duration: '3 months', amount: '₹4,000', proof: 'Screenshot attached' },
  { id: 'r3', code: 'GF0024', name: 'Priya Suresh', plan: null, duration: '', amount: '₹1,500', proof: 'UPI ref 4128 5502 1184' },
];

export function RenewalsView({
  decisions,
  onDecide,
}: {
  decisions: Record<string, 'approved' | 'rejected'>;
  onDecide: (id: string, d: 'approved' | 'rejected') => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <ViewTitle title="Renewals" sub="Payment requests from the member app" />
      <div className="mt-3.5 flex shrink-0 gap-1 self-start rounded-xl bg-dash-hover p-1">
        <span className="rounded-lg bg-dash-surface px-3 py-1 text-[11px] font-bold text-dash-ink shadow-sm dark:shadow-none">
          Pending ({RENEWALS.length - Object.keys(decisions).length})
        </span>
        <span className="rounded-lg px-3 py-1 text-[11px] font-bold text-dash-ink-muted">
          Reviewed
        </span>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5">
        {RENEWALS.map(req => {
          const decision = decisions[req.id];
          return (
            <Panel key={req.id} className="flex shrink-0 items-center gap-3 p-3">
              <Avatar name={req.name} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold text-dash-ink-soft">
                  {req.name}
                  <span className="ml-1.5 text-[11px] font-medium text-dash-ink-muted">{req.code}</span>
                </span>
                <span className="block text-[11px] text-dash-ink-dim">
                  {req.plan ? (
                    <>
                      {req.plan} <span className="text-dash-ink-muted">({req.duration})</span>
                    </>
                  ) : (
                    <span className={`${PILL} ${PILL_AMBER}`}>Dues payment</span>
                  )}
                </span>
                <span className="block text-[10.5px] text-dash-ink-muted">{req.proof}</span>
              </span>
              <span className="w-[64px] text-right text-[13px] font-bold text-dash-ink">{req.amount}</span>
              {decision ? (
                <span className={`w-[150px] text-center ${PILL} ${decision === 'approved' ? PILL_GREEN : PILL_RED}`}>
                  {decision === 'approved' ? 'Approved' : 'Rejected'}
                </span>
              ) : (
                <span className="flex w-[150px] gap-1.5">
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onDecide(req.id, 'approved')}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-dash-emerald-700 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-dash-emerald-800"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} /> Approve
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onDecide(req.id, 'rejected')}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-dash-red-600 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-dash-red-700"
                  >
                    <X className="h-3 w-3" strokeWidth={3} /> Reject
                  </button>
                </span>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

/* ── Reports ──────────────────────────────────────────────────────────────── */

const REPORT_TABS = ['Members', 'Money', 'Dues', 'Leaving', 'Attendance'];
const MONTHS = [
  { m: 'May', v: 28500 },
  { m: 'Jun', v: 31000 },
  { m: 'Jul', v: 26500 },
  { m: 'Aug', v: 33500 },
  { m: 'Sep', v: 30000 },
  { m: 'Oct', v: 34500 },
];
const TILES = [
  { label: 'Collected this month', value: '₹34,500', tone: 'text-dash-ink' },
  { label: 'Paid by UPI', value: '₹12,500', tone: 'text-dash-accent-strong' },
  { label: 'Paid in cash', value: '₹22,000', tone: 'text-dash-ink' },
  { label: 'Pending dues', value: '₹8,000', tone: 'text-dash-red-600 dark:text-dash-red-300' },
];

export function ReportsView() {
  const [tab, setTab] = useState('Money');
  const max = Math.max(...MONTHS.map(x => x.v));
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between">
        <ViewTitle title="Reports" sub="How your gym is doing, in plain numbers" />
        <button
          type="button"
          tabIndex={-1}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dash-border bg-dash-surface px-3 py-1.5 text-[11px] font-semibold text-dash-ink-dim"
        >
          <Download className="h-3.5 w-3.5" /> Download PDF
        </button>
      </div>
      <div className="mt-3 flex shrink-0 gap-1 self-start rounded-xl bg-dash-hover p-1">
        {REPORT_TABS.map(t => (
          <button
            key={t}
            type="button"
            tabIndex={-1}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1 text-[11px] font-bold transition-colors ${tab === t
              ? 'bg-dash-surface text-dash-ink shadow-sm dark:shadow-none'
              : 'text-dash-ink-muted hover:text-dash-ink-dim'
              }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-3 grid shrink-0 grid-cols-4 gap-2.5">
        {TILES.map(tile => (
          <Panel key={tile.label} className="p-3">
            <p className={`text-[17px] font-bold leading-none ${tile.tone}`}>{tile.value}</p>
            <p className="mt-1.5 text-[11px] text-dash-ink-muted">{tile.label}</p>
          </Panel>
        ))}
      </div>
      <Panel className="mt-3 flex min-h-0 flex-1 flex-col p-4">
        <p className="text-[12.5px] font-bold text-dash-ink">Money collected each month</p>
        <p className="text-[10.5px] text-dash-ink-muted">Counted in the month it was paid</p>
        <div className="mt-3 flex min-h-0 flex-1 items-end gap-4 border-b border-dash-line px-2">
          {MONTHS.map(x => (
            <div key={x.m} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10.5px] font-semibold text-dash-ink-dim">
                ₹{(x.v / 1000).toFixed(1)}k
              </span>
              <div
                className="w-full max-w-[56px] rounded-t-md bg-dash-blue-600"
                style={{ height: `${(x.v / max) * 70}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-4 px-2 pt-1.5">
          {MONTHS.map(x => (
            <span key={x.m} className="flex-1 text-center text-[11px] text-dash-ink-muted">{x.m}</span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ── Member App ───────────────────────────────────────────────────────────── */

const APP_CARDS = [
  { label: 'Active Members', value: '31' },
  { label: 'Pending Invitations', value: '9' },
  { label: "Today's Logins", value: '12' },
  { label: 'Weekly Active', value: '26' },
];
const PORTAL = [
  { name: 'Aakash Das', portal: 'Active', invite: 'Accepted', login: 'Today' },
  { name: 'Priya Suresh', portal: 'Active', invite: 'Accepted', login: 'Yesterday' },
  { name: 'Ragul M.', portal: 'Pending', invite: 'Sent', login: 'Never' },
  { name: 'Deepa Nair', portal: 'Pending', invite: 'Not sent', login: 'Never' },
];
const LEADERS = [
  { name: 'Priya S.', xp: '2,480', streak: '21 days' },
  { name: 'Aakash D.', xp: '2,115', streak: '14 days' },
  { name: 'Naveen V.', xp: '1,760', streak: '9 days' },
];

export function MemberAppView() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between">
        <ViewTitle title="Member App" sub="Invite members and track engagement" />
        <button
          type="button"
          tabIndex={-1}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-dash-blue-600 px-3.5 py-2 text-[11.5px] font-semibold text-white"
        >
          <Send className="h-3.5 w-3.5" /> Invite all members
        </button>
      </div>
      <div className="mt-3 grid shrink-0 grid-cols-4 gap-2.5">
        {APP_CARDS.map(card => (
          <Panel key={card.label} className="p-2.5">
            <p className="text-[17px] font-bold leading-none text-dash-ink">{card.value}</p>
            <p className="mt-1 text-[11px] text-dash-ink-muted">{card.label}</p>
          </Panel>
        ))}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 gap-3">
        <Panel className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <p className="shrink-0 border-b border-dash-line px-4 py-2.5 text-[12.5px] font-bold text-dash-ink">
            Member Portal Management
          </p>
          <div className="flex shrink-0 items-center border-b border-dash-border bg-dash-hover px-4 py-1.5 text-[11px] font-bold text-dash-ink-muted">
            <span className="flex-1">Member Name</span>
            <span className="w-[72px]">Portal</span>
            <span className="w-[76px]">Invitation</span>
            <span className="w-[70px] text-right">Last Login</span>
          </div>
          <div className="divide-y divide-dash-line">
            {PORTAL.map(row => (
              <div key={row.name} className="flex items-center px-4 py-2">
                <span className="flex-1 truncate text-[11.5px] font-semibold text-dash-ink-soft">{row.name}</span>
                <span className="w-[72px]">
                  <span className={`${PILL} ${row.portal === 'Active' ? PILL_GREEN : PILL_AMBER}`}>{row.portal}</span>
                </span>
                <span className="w-[76px] text-[11px] text-dash-ink-dim">{row.invite}</span>
                <span className="w-[70px] text-right text-[10.5px] text-dash-ink-muted">{row.login}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="flex w-[228px] shrink-0 flex-col p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-dash-ink-muted">
            <Trophy className="h-3 w-3" /> Leaderboard
          </p>
          <div className="mt-2 divide-y divide-dash-line">
            {LEADERS.map((l, i) => (
              <div key={l.name} className="flex items-center gap-2 py-2">
                <span className="w-3 text-[11px] font-bold text-dash-ink-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-semibold text-dash-ink-soft">{l.name}</span>
                  <span className="block text-[10.5px] text-dash-ink-muted">{l.streak} streak</span>
                </span>
                <span className={`${PILL} ${PILL_BLUE}`}>{l.xp} XP</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── Notices ──────────────────────────────────────────────────────────────── */

const NOTICES = [
  { id: 'n1', kind: 'Holiday', title: 'Closed on Diwali', body: 'The gym will be closed on 1 November. Normal hours resume the next day.', date: '28 Oct', pinned: true },
  { id: 'n2', kind: 'Timing', title: 'New evening batch', body: 'A 7 PM to 9 PM batch starts from Monday for working members.', date: '24 Oct', pinned: false },
  { id: 'n3', kind: 'Offer', title: 'Quarterly plan offer', body: 'Renew a quarterly plan this month and get 10 days free.', date: '20 Oct', pinned: false },
];

export function NoticesView() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between">
        <ViewTitle title="Gym notices" sub="Shown to members in the app" />
        <button
          type="button"
          tabIndex={-1}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-dash-blue-600 px-3.5 py-2 text-[11.5px] font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> New notice
        </button>
      </div>
      <div className="mt-3.5 flex min-h-0 flex-1 flex-col gap-2.5">
        {NOTICES.map(n => (
          <Panel key={n.id} className="flex shrink-0 items-start gap-3 p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-dash-accent-soft text-dash-accent-text">
              <Bell className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-dash-ink-soft">{n.title}</span>
                <span className={`${PILL} ${PILL_BLUE}`}>{n.kind}</span>
                {n.pinned && <Pin className="h-3 w-3 text-dash-amber-700 dark:text-dash-amber-300" />}
              </span>
              <span className="mt-0.5 block text-[11px] text-dash-ink-dim">{n.body}</span>
            </span>
            <span className="shrink-0 text-[10.5px] text-dash-ink-muted">{n.date}</span>
          </Panel>
        ))}
      </div>
    </div>
  );
}
