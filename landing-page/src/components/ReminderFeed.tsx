import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';

/* The automatic messages from the morning run (about 9 AM India time, featurePages.ts), as a short
   feed that adds one entry at a time while it is on screen. Types and wording are the real message
   types; names and amounts are sample data. */
const POOL = [
  { name: 'Priya Sharma', type: 'Expiry reminder', detail: '5 days left' },
  { name: 'Fathima R.', type: 'Payment due', detail: '₹500 pending' },
  { name: 'Karan Singh', type: 'Welcome', detail: 'New member, Monthly' },
  { name: 'Ravi Kumar', type: 'Membership expired', detail: 'Ended 24 Oct' },
  { name: 'Neha Gupta', type: 'Birthday wishes', detail: 'Date of birth saved' },
  { name: 'Arjun Menon', type: 'Renewal confirmation', detail: 'Annual, till Oct 2027' },
  { name: 'Imran Khan', type: 'Expiry reminder', detail: '2 days left' },
  { name: 'Divya M.', type: 'Payment due', detail: '₹1,200 pending' },
] as const;

const VISIBLE = 4;

export function ReminderFeed() {
  const root = useRef<HTMLDivElement>(null);
  // `head` counts entries added so far; the list shows the newest VISIBLE of them, newest first.
  const [head, setHead] = useState(VISIBLE);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = root.current;
    if (!el) return;
    let timer: number | undefined;
    const io = new IntersectionObserver(([entry]) => {
      window.clearInterval(timer);
      if (entry.isIntersecting) timer = window.setInterval(() => setHead(h => h + 1), 2400);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const items = Array.from({ length: VISIBLE }, (_, i) => {
    const n = head - 1 - i;
    return { key: n, ...POOL[n % POOL.length] };
  });

  return (
    <div ref={root}>
      <div aria-hidden className="overflow-hidden rounded-[14px] border border-dash-border bg-dash-surface">
        <div className="flex items-center justify-between border-b border-dash-line px-4 py-3">
          <p className="text-[14px] font-semibold text-dash-ink">Sent today at 9:00 AM</p>
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-dash-ink-muted">
            <span className="h-2 w-2 rounded-full bg-[var(--wa-green)]" />
            WhatsApp
          </span>
        </div>
        <ul className="relative h-[264px]">
          {items.map((item, i) => (
            <li
              key={item.key}
              className={`feed-item absolute inset-x-0 flex items-center gap-3 border-b border-dash-line px-4 last:border-b-0 ${i === 0 && head > VISIBLE ? 'feed-item-new' : ''}`}
              style={{ top: i * 66, height: 66 }}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--wa-green)] text-white">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-dash-ink">{item.name}</span>
                <span className="block truncate text-[12px] text-dash-ink-muted">
                  {item.type}, {item.detail}
                </span>
              </span>
              <span className="text-[12px] tabular-nums text-dash-ink-muted">9:00</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">
        Example of the automatic WhatsApp messages GymFlow sends in its morning run: expiry reminders,
        payment due reminders, welcome messages, expired-membership messages, birthday wishes and renewal
        confirmations.
      </p>
      <p className="mt-2 text-[12px] text-muted-foreground">Sample data</p>
    </div>
  );
}
