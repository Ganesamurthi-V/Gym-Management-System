import { useEffect, useState } from 'react';
import { Ban, BellRing, UserPlus, Wallet } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { AutomationOrbit, type OrbitChip } from './AutomationOrbit';
import { ShinyText } from './ShinyText';
import { WhatsAppBubble, WhatsAppThread } from './WhatsAppThread';
import { MESSAGE_TYPES } from './whatsappMessages';

/* Chips orbiting the phone. Positions are by bearing from the phone's centre
   (330px wide, so anything with x inside ±165 is hidden behind it), each with at
   least 20 degrees of headroom so the sway never tucks a chip behind the device:
   welcome 200deg r264, payment 169deg r248, renewal 340deg r250. Radii stay in
   the 248-264 band so they read as one shared orbit and do not clip the section's
   right edge at xl. Dots are where each bearing crosses the ellipse, in the orbit
   SVG's 640x680 space (centre 320,340 = phone centre). */
const ORBIT_CHIPS: readonly OrbitChip[] = [
  { icon: UserPlus, label: 'Welcome', position: '-left-[109px] top-[28%]', dot: { x: 94, y: 256 } },
  { icon: Wallet, label: 'Payment', position: '-left-[104px] top-[54%]', dot: { x: 86, y: 386 } },
  { icon: BellRing, label: 'Expired', position: '-right-[95px] top-[29%]', dot: { x: 546, y: 256 } },
];

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
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });
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
    <section
      id="whatsapp"
      ref={scope}
      aria-labelledby="whatsapp-title"
      className="relative overflow-hidden border-y border-border-subtle bg-muted px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <span className="reveal eyebrow">WhatsApp automation</span>

            <h2 id="whatsapp-title" className="reveal display-2 mt-4 text-balance">
              <em className="display-accent">
                <ShinyText text="Unlimited" speed={2.8} spread={120} />
              </em>
              {' WhatsApp reminders, '}
              <br />
              <span className="text-foreground">built in and not billed extra</span>
            </h2>

            <p className="reveal lead mt-6 max-w-[520px]">
              Every GymFlow account includes fully automated WhatsApp messaging, with <ShinyText text="no per-message charge from GymFlow." speed={2.8} spread={120} />{' '}
              <br></br><a
                href="/whatsapp"
                className="inline-flex min-h-[44px] items-center rounded text-sm font-medium text-accent-text underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                More on WhatsApp reminders
              </a>
            </p>

            {/* Tabs replace the three stacked cards: one compact control, and the
                phone beside it carries the message itself. */}
            <div className="reveal mt-8">
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
                  <span className="inline-block rounded-pill bg-whatsapp-soft px-2.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wider text-whatsapp-ink">
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

            <ul className="reveal mt-6 flex flex-wrap items-center gap-x-6 gap-y-2.5">
              {NEVER_PAY_FOR.map(item => (
                <li key={item} className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <Ban className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  No {item.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>

          {/* The phone is hidden below md, so the column is too, rather than
              leaving an empty grid cell and its gap on mobile. */}
          <div className="hidden flex-col items-center md:flex">
            <div className="reveal relative mx-auto hidden w-full max-w-[300px] shrink-0 md:block">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 scale-125"
                style={{
                  background:
                    'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--whatsapp) 26%, transparent) 0%, transparent 68%)',
                  filter: 'blur(12px)',
                }}
              />
              {/* phone-scene / phone-bob / phone-tilt each own one transform. The
                  orbit is a sibling of phone-bob so it runs on its own clock and
                  reads as surrounding the phone, not painted onto it. The phone
                  itself never re-mounts on a tab change: WhatsAppThread keys
                  and animates only the message bubble. */}
              <div className="phone-scene relative">
                <AutomationOrbit chips={ORBIT_CHIPS} />
                <div className="phone-bob">
                  <div className="phone-tilt">
                    <WhatsAppThread messages={[active.message]} label={active.label} />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
