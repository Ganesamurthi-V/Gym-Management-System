import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { WhatsAppBubble, WhatsAppThread } from './WhatsAppThread';
import { MESSAGE_TYPES } from './whatsappMessages';
import { Section, SectionHead, Split } from './layout/Section';
import { ReminderFeed } from './ReminderFeed';

const CYCLE_MS = 3000;

/* Phrased as bare nouns, not "No per-message fees". The cell they sit in is
   already labelled "What you never pay for", and keeping the "No" prefix made
   every line read as a double negative under that heading. */
const NEVER_PAY_FOR = [
  'Per-message fees',
  'Monthly caps',
  'Third-party integrations',
] as const;

export function WhatsAppSection() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);

  /* Cycles until the visitor picks a tab themselves — after that the choice is
     theirs and it must not move under them. Skipped for reduced-motion users. */
  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setIndex(i => (i + 1) % MESSAGE_TYPES.length),
      CYCLE_MS
    );
    return () => window.clearInterval(timer);
  }, [auto]);

  const active = MESSAGE_TYPES[index];

  return (
    <Section id="whatsapp" labelledBy="whatsapp-title" tone="paper">
      <Split
        head={
          <SectionHead
            title={
              <h2 id="whatsapp-title" className="display-2 text-balance">
                {'Unlimited WhatsApp reminders, '}
                <br />
                <span className="text-foreground">built in and not billed extra</span>
              </h2>
            }
            lead={
              <>
                Every GymFlow account includes fully automated WhatsApp messaging, with no per-message charge from GymFlow.{' '}
                <a
                  href="/whatsapp"
                  className="inline-flex min-h-[44px] items-center rounded text-sm font-medium text-accent-text underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  More on WhatsApp reminders
                </a>
              </>
            }
          >
            <p className="-mt-3 text-xs text-muted-foreground">
              Unlimited WhatsApp, not billed extra, on all paid plans*
            </p>

        {/* Tabs replace the three stacked cards: one compact control, and the
            phone beside it carries the message itself. */}
        <div className="mt-6">
          <div
            role="tablist"
            aria-label="Automated WhatsApp messages"
            className="flex flex-wrap gap-2"
          >
            {MESSAGE_TYPES.map((type, i) => {
              const Icon = type.icon;
              const selected = i === index;
              return (
                <button
                  key={type.id}
                  type="button"
                  role="tab"
                  id={`wa-tab-${type.id}`}
                  aria-selected={selected}
                  aria-controls="wa-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setAuto(false);
                    setIndex(i);
                  }}
                  onKeyDown={e => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    e.preventDefault();
                    const step = e.key === 'ArrowRight' ? 1 : -1;
                    setAuto(false);
                    setIndex((i + step + MESSAGE_TYPES.length) % MESSAGE_TYPES.length);
                    document
                      .getElementById(`wa-tab-${MESSAGE_TYPES[(i + step + MESSAGE_TYPES.length) % MESSAGE_TYPES.length].id}`)
                      ?.focus();
                  }}
                  className={`inline-flex items-center gap-2 rounded-pill border px-4 py-2.5 text-[14px] font-medium tracking-tight transition-colors ${
                    selected
                      ? 'border-transparent bg-whatsapp-soft text-whatsapp-ink'
                      : 'border-border-subtle bg-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {type.title}
                </button>
              );
            })}
          </div>

          <div
            id="wa-panel"
            role="tabpanel"
            aria-labelledby={`wa-tab-${active.id}`}
            aria-live={auto ? 'off' : 'polite'}
            className="mt-5 md:min-h-[64px]"
          >
            <div key={active.id} className="wa-swap">
              <span className="inline-block rounded-pill bg-whatsapp-soft px-2.5 py-0.5 text-xs font-medium text-whatsapp-ink">
                {active.when}
              </span>
              <p className="mt-3 max-w-[460px] text-[15px] leading-relaxed text-muted-foreground">
                {active.desc}
              </p>
              {/* The phone is hidden below md, so on mobile only the message shows: no
                  chat surface and no header image, just the bubble. The minimum
                  height stops the page jumping between templates. */}
              <div className="mt-5 min-h-[200px] md:hidden">
                <WhatsAppBubble
                  message={{ ...active.message, banner: false }}
                  large
                  tail
                  className="ml-2 w-[calc(100%-0.5rem)] border border-border-subtle"
                />
              </div>
            </div>
          </div>
        </div>


            <ul className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2.5">
              {NEVER_PAY_FOR.map(item => (
                <li key={item} className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <Ban className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  No {item.toLowerCase()}
                </li>
              ))}
            </ul>
          </SectionHead>
        }
      >
        {/* The phone is hidden below md; there the bubble above and the feed carry the section. */}
        <div className="hidden flex-col items-center md:flex">
          <div className="relative mx-auto w-full max-w-[300px] shrink-0">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-125"
              style={{
                background:
                  'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--whatsapp) 26%, transparent) 0%, transparent 68%)',
                filter: 'blur(12px)',
              }}
            />
            <WhatsAppThread messages={[active.message]} label={active.label} />
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-[420px]">
          <ReminderFeed />
        </div>
      </Split>
    </Section>
  );
}
