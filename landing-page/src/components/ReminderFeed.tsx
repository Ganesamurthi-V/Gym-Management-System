import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';
import '../styles/whatsapp.css';

/* The automatic messages from the morning run (about 9 AM India time, featurePages.ts), as a short
   feed that adds one entry at a time while it is on screen. Types and wording are the real message
   types; names, IDs and amounts are sample data. */
const POOL = [
  { name: 'Priya Sharma', type: 'Expiry reminder', detail: '5 days left', id: 'GF0012' },
  { name: 'Fathima R.', type: 'Payment due', detail: '₹500 pending', id: 'GF0031' },
  { name: 'Karan Singh', type: 'Welcome', detail: 'New member, Monthly', id: 'GF0086' },
  { name: 'Ravi Kumar', type: 'Membership expired', detail: 'Ended 24 Oct', id: 'GF0044' },
  { name: 'Neha Gupta', type: 'Birthday wishes', detail: 'Date of birth saved', id: 'GF0057' },
  { name: 'Arjun Menon', type: 'Renewal confirmation', detail: 'Annual, till Oct 2027', id: 'GF0003' },
  { name: 'Imran Khan', type: 'Expiry reminder', detail: '2 days left', id: 'GF0070' },
  { name: 'Divya M.', type: 'Payment due', detail: '₹1,200 pending', id: 'GF0022' },
] as const;

const VISIBLE = 3;
/* Slip height plus the gap between slips, in px. */
const STEP = 88;

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
      if (entry.isIntersecting) timer = window.setInterval(() => setHead(h => h + 1), 2800);
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
      <div aria-hidden>
        <p className="mb-4 font-display text-[18px] font-medium text-foreground">Sent today at 9:00 AM</p>
        <ul className="relative" style={{ height: VISIBLE * STEP }}>
          {items.map((item, i) => (
            <li
              key={item.key}
              className={`absolute inset-x-0 top-0 transition-transform duration-500 ease-out motion-reduce:transition-none ${i === 0 && head > VISIBLE ? 'wa-slip-new' : ''}`}
              style={{ height: STEP - 12, transform: `translateY(${i * STEP}px)` }}
            >
              <div className="slip wa-slip h-full">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-[16px] font-medium">{item.name}</span>
                  <span className="block truncate font-sans text-[14px] leading-snug text-muted-foreground">
                    {item.type}, {item.detail}
                  </span>
                </span>
                <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:block">{item.id}</span>
                <span className="stamp shrink-0 whitespace-nowrap">Sent 9:00</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">
        Example of the automatic WhatsApp messages GymFlow sends in its morning run: expiry reminders,
        payment due reminders, welcome messages, expired-membership messages, birthday wishes and renewal
        confirmations.
      </p>
      <p className="mt-2 text-[14px] text-muted-foreground">Sample data</p>
    </div>
  );
}
