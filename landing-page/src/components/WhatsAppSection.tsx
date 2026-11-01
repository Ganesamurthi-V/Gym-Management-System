import { useEffect, useState } from 'react';
import { WhatsAppBubble, WhatsAppThread } from './WhatsAppThread';
import { MESSAGE_TYPES } from './whatsappMessages';
import { Section } from './layout/Section';
import { ReminderFeed } from './ReminderFeed';
import { AsciiIcon } from './ascii';
import { Rise, SlideIndicator, TiltFrame } from './fx';
import '../styles/whatsapp.css';

const CYCLE_MS = 3000;

/* Copy deck wording (the facts match featurePages.ts: first reminder 18 days out, then every 3 days, up to 7). */
const POINTS = [
  'The first expiry reminder goes out 18 days before the plan ends.',
  'A reminder follows every 3 days, up to 7 times, until the member renews.',
  'Reminders stop as soon as you record the renewal.',
] as const;

export function WhatsAppSection() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);

  /* Cycles until the visitor picks a tab themselves, after that the choice is
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
      <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="min-w-0 lg:col-span-6">
          <div className="lg:sticky lg:top-28">
            <span className="wa-badge">
              <AsciiIcon name="whatsapp" size={3} />
            </span>
            <h2 id="whatsapp-title" className="display-1 mt-6 min-w-0 text-balance [overflow-wrap:break-word]">
              WhatsApp reminders that send themselves
            </h2>
            <p className="lead mt-6 max-w-[52ch]">
              Welcome, renewal, expiry, payment due and birthday messages go out automatically, with no per-message charge from GymFlow.
            </p>

            <ul className="wa-points mt-8 max-w-[52ch]">
              {POINTS.map(point => (
                <li key={point} className="text-[16px] leading-relaxed text-foreground">
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-6">
              <a
                href="/whatsapp"
                className="inline-flex min-h-[44px] items-center text-[16px] font-medium text-accent-text underline-offset-2 hover:underline"
              >
                More on WhatsApp reminders
              </a>
            </p>

            {/* Three tabs in one white keycap; the blue pill slides under the active one on transform only. */}
            <div className="wa-seg mt-6">
              <div role="tablist" aria-label="Automated WhatsApp messages" className="wa-seg-track grid grid-cols-3">
                <SlideIndicator index={index} count={MESSAGE_TYPES.length} className="wa-seg-thumb" />
                {MESSAGE_TYPES.map((type, i) => {
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
                        const next = (i + step + MESSAGE_TYPES.length) % MESSAGE_TYPES.length;
                        setAuto(false);
                        setIndex(next);
                        document.getElementById(`wa-tab-${MESSAGE_TYPES[next].id}`)?.focus();
                      }}
                      className={`wa-tab relative z-10 inline-flex min-h-[44px] items-center justify-center whitespace-nowrap px-3 py-2 font-display text-[16px] font-medium sm:px-5 ${
                        selected ? 'text-accent-ink' : 'text-foreground hover:text-accent-text'
                      }`}
                    >
                      {type.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              id="wa-panel"
              role="tabpanel"
              aria-labelledby={`wa-tab-${active.id}`}
              aria-live={auto ? 'off' : 'polite'}
              className="mt-4 md:min-h-[72px]"
            >
              <div key={active.id} className="wa-swap">
                <div className="wa-copy">
                  <p className="text-[14px] font-medium text-accent-text">{active.when}</p>
                  <p className="mt-1 max-w-[460px] text-[16px] leading-relaxed text-foreground">{active.desc}</p>
                </div>
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
        </div>

        {/* The phone lifts over the upper edge of the accent-soft panel; the reminder slips sit inside it.
            Below md the phone is hidden and the bubble above carries the message. */}
        <div className="min-w-0 lg:col-span-6">
          <div className="mx-auto max-w-[560px]">
            <div className="wa-phone mx-auto hidden w-full max-w-[300px] md:block">
              <TiltFrame max={2}>
                <WhatsAppThread messages={[active.message]} label={active.label} />
              </TiltFrame>
            </div>
            <Rise className="wa-panel">
              <ReminderFeed />
            </Rise>
          </div>
        </div>
      </div>
    </Section>
  );
}
