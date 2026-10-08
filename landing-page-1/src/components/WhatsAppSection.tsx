import { useEffect, useState } from 'react';
import { Ban, BellRing, UserPlus, Wallet } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { AutomationOrbit, type OrbitChip } from './AutomationOrbit';
import { ShinyText } from './ShinyText';
import { WhatsAppThread, type ThreadMessage } from './WhatsAppThread';

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

/* One entry per tab. `message` is the rendered artefact shown in the phone;
   `desc` and `sample` serve the mobile layout, where the phone is hidden and the
   active tab shows a plain bubble instead. Bodies use the live templates'
   asterisk-bold syntax so what the phone shows is what a member receives. */
const MESSAGE_TYPES = [
  {
    id: 'welcome',
    icon: UserPlus,
    title: 'Welcome',
    desc: 'Sent the moment a member joins, with their plan and expiry.',
    when: 'On joining',
    label: 'A new member’s phone showing the automated welcome message: a branded confirmation that their annual membership is active, with member ID, plan and start date.',
    message: {
      banner: true,
      time: '11:50',
      footer: 'Powered by Gym Flow',
      body: `Hi Ganesh! 👋

Your membership has been successfully *activated*.

Member ID: *GF0086*
Membership Plan: *Annual (12 Months)*
Start Date: *07 Sep 2026*

Thank you for choosing *Fit zone gym*. We're excited to be part of your fitness journey.❤️`,
    } satisfies ThreadMessage,
    sample: 'Hi Naveen! Welcome to Fit Zone Gym. We’re excited to have you on board.',
  },
  {
    id: 'expired',
    icon: BellRing,
    title: 'Expired',
    desc: 'Tells a member their plan has lapsed and asks them to renew.',
    when: 'On expiry',
    label: 'A member’s phone showing an automated WhatsApp message from their gym saying their membership has expired, with member ID and expiry date, asking them to renew.',
    message: {
      banner: true,
      time: '09:39',
      footer: 'Powered by Gym Flow',
      body: `Hi Ganesh! 👋

Your membership with *Vivi gym* has expired.

 Member ID: *GF001*
Expired On: *26/07/2026*

To continue uninterrupted access to the gym, please *renew* your membership at your earliest convenience.❤️`,
    } satisfies ThreadMessage,
    sample: 'Hi Ganesh! Your membership with Vivi gym has expired.',
  },
  {
    id: 'payment',
    icon: Wallet,
    title: 'Payment due',
    desc: 'Nudges the members who still owe, without you asking twice.',
    when: 'Every 3 days',
    label: 'A member’s phone showing an automated WhatsApp payment due alert from their gym.',
    message: {
      banner: true,
      time: '09:40',
      footer: 'Powered by Gym Flow',
      body: `Hi Ganesh! 👋

This is a reminder that your membership payment is *due*.

Amount : *₹2000*

Please complete your payment before the due date to keep your membership active. ❤️`,
    } satisfies ThreadMessage,
    sample: 'Hi Ganesh! This is a reminder that your membership payment is due. Amount : ₹2000',
  },
] as const;

const CYCLE_MS = 5000;

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
              </em>{' '}
              WhatsApp.
              <br />
              <span className="text-foreground">Built in, not billed extra.</span>
            </h2>

            <p className="reveal lead mt-6 max-w-[520px]">
              Every GymFlow account includes fully automated WhatsApp messaging, with <ShinyText text="zero extra cost." speed={2.8} spread={120} />
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
                className="mt-5 min-h-[132px]"
              >
                <div key={active.id} className="wa-swap">
                  <span className="inline-block rounded-pill bg-whatsapp-soft px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-whatsapp-ink">
                    {active.when}
                  </span>
                  <p className="mt-3 max-w-[460px] text-[15px] leading-relaxed text-muted-foreground">
                    {active.desc}
                  </p>
                  {/* The phone is hidden below md, so on mobile the message shows
                      here as a plain bubble. */}
                  <p className="mt-4 max-w-[420px] rounded-xl rounded-tl-sm bg-whatsapp-soft px-3.5 py-2.5 text-[13px] leading-snug text-foreground md:hidden">
                    {active.sample}
                  </p>
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
                  reads as surrounding the phone, not painted onto it. The keyed
                  wrapper inside re-mounts on tab change so only the screen
                  content fades, not the float or tilt. */}
              <div className="phone-scene relative">
                <AutomationOrbit chips={ORBIT_CHIPS} />
                <div className="phone-bob">
                  <div className="phone-tilt">
                    <div key={active.id} className="wa-swap">
                      <WhatsAppThread messages={[active.message]} label={active.label} />
                    </div>
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
