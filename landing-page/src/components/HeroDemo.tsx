import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { WhatsAppBubble, type ThreadMessage } from './WhatsAppThread';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';
import { SpotlightSurface, StampIn, TiltFrame } from './fx';
import '../styles/hero.css';

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
 * It sits on a white frame: the WhatsApp message is a small card over the frame's right corner, and the
 * renewal is a chip that settles on it. Plays once when it comes into view, never loops, and can be replayed with a button. Under
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
      { threshold: 0.15 },
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
    <div ref={root} className="hero-demo">
      <div className="hero-float">
        <TiltFrame max={1.5}>
          <SpotlightSurface className="rounded-[20px]">
            <div role="img" aria-label={LABEL} className="hero-frame plastic">
              {/* The owner console's member list, in the console's own colours (--dash-*). */}
              <div className="hero-lid">
                <div className="flex items-center justify-between gap-3 border-b border-dash-line px-4 py-3 sm:px-6 sm:py-4">
                  <p className="text-[16px] font-semibold text-dash-ink">Members</p>
                  <div className="flex gap-1 text-[13px] font-medium">
                    {['All', 'Active', 'Expiring', 'Expired'].map((tab, i) => (
                      <span
                        key={tab}
                        className={`rounded-md px-2.5 py-1 ${i === 0 ? 'bg-dash-accent-chip text-dash-accent-strong' : 'text-dash-ink-muted'}`}
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
                        className={`flex items-center gap-3 border-b border-dash-line px-4 py-3.5 last:border-b-0 sm:gap-4 sm:px-6 sm:py-4 ${
                          isRavi && step === 1 ? 'bg-dash-accent-soft' : ''
                        } motion-safe:transition-colors motion-safe:duration-300`}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-dash-raise text-[13px] font-semibold text-dash-ink-dim">
                          {member.name
                            .split(' ')
                            .map(part => part[0])
                            .join('')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-dash-ink">{member.name}</span>
                          <span className="block text-[13px] tabular-nums text-dash-ink-muted">
                            {member.id}, {member.plan}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <span className={`status-chip status-${status}`}>{STATUS_LABEL[status]}</span>
                          {note && <span className="text-[12px] tabular-nums text-dash-ink-muted">{note}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* The message GymFlow sends, as a small white card over the frame's right corner. The chip
                mounts when the renewal is recorded, so it settles then. */}
            <div className="hero-slot">
              <div data-on={step >= 1} className="hero-slip slip relative z-10 p-3 pt-4">
                <p className="mb-2 font-sans text-[13px] text-muted-foreground">
                  {step === 2 ? 'Renewal recorded. Confirmation sent on WhatsApp.' : 'Ravi’s WhatsApp, 9:00 AM'}
                </p>
                <div className="rounded-[8px] bg-[var(--wa-chat)] p-2 font-sans">
                  <WhatsAppBubble message={MESSAGE} className="w-full" />
                </div>
              </div>
              {step === 2 && (
                <StampIn delay={0.1} className="hero-stamp">
                  <span className="stamp">Renewed till 26 Nov</span>
                </StampIn>
              )}
            </div>
          </SpotlightSurface>
        </TiltFrame>
      </div>

      <div className="hero-foot flex items-center gap-4 text-[14px] text-muted-foreground">
        <span>Sample data</span>
        <button
          type="button"
          onClick={replay}
          className="inline-flex min-h-[44px] items-center gap-1.5 px-1 font-medium text-accent-text transition-colors hover:text-foreground active:text-accent-strong"
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
          Play again
        </button>
      </div>
    </div>
  );
}
