import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { WhatsAppBubble, type ThreadMessage } from './WhatsAppThread';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';

/**
 * The hero's product moment, and the page's one piece of unprompted motion (DESIGN.md).
 *
 * It tells the story the product exists for, in three beats a gym owner recognises:
 *   0. the member list, with Ravi's plan already ended (Expired);
 *   1. the WhatsApp message GymFlow sends him at the morning run (about 9 AM India time);
 *   2. the owner records the renewal: Ravi turns Active and a renewal confirmation goes out.
 *
 * Every behaviour shown is a product fact from src/data/featurePages.ts. The message body is the
 * live "Expired" template's wording (see whatsappMessages.ts) with this sample member's values, and
 * the renewal confirmation is shown only as a notice, because its template text is not reproduced
 * on this site. Names, IDs and dates are sample data and labelled so.
 *
 * Plays once when it comes into view, never loops, and can be replayed with a button. Under
 * reduced motion it shows the final state with nothing moving.
 */

type Status = 'active' | 'expiring' | 'expired';

const MEMBERS: { id: string; name: string; plan: string; status: Status; note?: string }[] = [
  { id: 'GF0012', name: 'Ravi Kumar', plan: 'Monthly', status: 'expired', note: 'Ended 24 Oct' },
  { id: 'GF0031', name: 'Priya Sharma', plan: 'Quarterly', status: 'expiring', note: '5 days left' },
  { id: 'GF0047', name: 'Arjun Menon', plan: 'Annual', status: 'active' },
  { id: 'GF0052', name: 'Fathima R.', plan: 'Monthly', status: 'active', note: '₹500 pending' },
];

const STATUS_LABEL: Record<Status, string> = { active: 'Active', expiring: 'Expiring', expired: 'Expired' };

// No header image here: the template's wording is what tells the story, and at this size the banner
// pushed the bubble over the status column.
const MESSAGE: ThreadMessage = {
  time: '9:00',
  footer: 'Powered by Gym Flow',
  body: `Hi Ravi! 👋

Your membership with *Fit Zone Gym* has expired.

Member ID: *GF0012*
Expired On: *24/10/2026*

To continue uninterrupted access to the gym, please *renew* your membership at your earliest convenience.❤️`,
};

const LABEL =
  'Sample data. A GymFlow member list where Ravi Kumar’s monthly plan has expired. GymFlow sends him the expired-membership message on WhatsApp at 9 AM; after the owner records his renewal he shows as Active until 26 November and a renewal confirmation is sent.';

export function HeroDemo() {
  const root = useRef<HTMLDivElement>(null);
  // Under reduced motion the final state is the starting state, so nothing ever moves.
  const [step, setStep] = useState(() => (prefersReducedMotion() ? 2 : 0));
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = root.current;
    if (!el) return;
    const timers: number[] = [];
    // Starts when the demo is actually on screen: on a phone it sits below the copy, and a
    // sequence that finished before anyone scrolled to it would be a still picture.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        timers.push(window.setTimeout(() => setStep(1), 900));
        timers.push(window.setTimeout(() => setStep(2), 3600));
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(t => window.clearTimeout(t));
    };
  }, [run]);

  const replay = () => {
    if (prefersReducedMotion()) return;
    setStep(0);
    setRun(r => r + 1);
  };

  const ravi = step === 2 ? 'active' : 'expired';

  return (
    <div ref={root} className="relative">
      <div role="img" aria-label={LABEL} className="relative lg:pb-[150px]">
        {/* The owner console's member list, in the console's own colours (--dash-*). */}
        <div className="hero-demo-panel overflow-hidden rounded-[16px] border border-dash-border bg-dash-surface">
          <div className="flex items-center justify-between gap-3 border-b border-dash-line px-4 py-3 sm:px-5">
            <p className="text-[15px] font-semibold text-dash-ink">Members</p>
            <div className="flex gap-1 text-[12px] font-medium">
              {['All', 'Active', 'Expiring', 'Expired'].map((tab, i) => (
                <span
                  key={tab}
                  className={`rounded-md px-2 py-1 ${i === 0 ? 'bg-dash-accent-chip text-dash-accent-strong' : 'text-dash-ink-muted'}`}
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>

          <ul>
            {MEMBERS.map(member => {
              const isRavi = member.id === 'GF0012';
              const status = isRavi ? ravi : member.status;
              const note = isRavi && step === 2 ? 'Renewed till 26 Nov' : member.note;
              return (
                <li
                  key={member.id}
                  className={`flex items-center gap-3 border-b border-dash-line px-4 py-3 last:border-b-0 sm:px-5 ${
                    isRavi && step === 1 ? 'bg-dash-accent-soft' : ''
                  } motion-safe:transition-colors motion-safe:duration-500`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dash-raise text-[12px] font-semibold text-dash-ink-dim">
                    {member.name
                      .split(' ')
                      .map(part => part[0])
                      .join('')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-dash-ink">{member.name}</span>
                    <span className="block text-[12px] tabular-nums text-dash-ink-muted">
                      {member.id}, {member.plan}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className={`status-chip status-${status}`}>{STATUS_LABEL[status]}</span>
                    {note && <span className="text-[11px] tabular-nums text-dash-ink-muted">{note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The message GymFlow sends. It overlaps the lower rows on the name side, so Ravi's row and every
            status chip stay visible: the chip changing is the point of the story. Below lg it sits in the
            flow under the panel instead. */}
        <div
          className={`relative z-10 -mt-3 ml-auto mr-2 w-[88%] sm:w-[320px] lg:absolute lg:bottom-0 lg:left-[-32px] lg:mr-0 lg:mt-0 lg:w-[300px] ${
            step >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          } motion-safe:transition-all motion-safe:duration-500`}
        >
          <div className="rounded-[12px] bg-[var(--wa-chat)] p-2.5 shadow-[0_18px_40px_-18px_rgb(20_33_61/0.45)]">
            <p className="mb-2 text-center">
              <span className="rounded-md bg-[var(--wa-chip)] px-2 py-[3px] text-[10px] font-semibold text-[var(--wa-ink-dim)]">
                Ravi’s WhatsApp, 9:00 AM
              </span>
            </p>
            <WhatsAppBubble message={MESSAGE} className="w-full" />
          </div>
        </div>

        {/* Renewal recorded. A notice rather than the message itself; see the note at the top. */}
        <div
          className={`absolute left-4 top-[-18px] flex items-center gap-2 rounded-[10px] bg-foreground px-3 py-2 text-[12px] font-medium text-background shadow-[0_12px_28px_-14px_rgb(20_33_61/0.6)] ${
            step === 2 ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          } motion-safe:transition-all motion-safe:duration-500`}
        >
          <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
          Renewal recorded. Confirmation sent on WhatsApp.
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4 text-[12px] text-muted-foreground">
        <span>Sample data</span>
        <button
          type="button"
          onClick={replay}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 font-medium text-accent-text hover:text-foreground"
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
          Play again
        </button>
      </div>
    </div>
  );
}
