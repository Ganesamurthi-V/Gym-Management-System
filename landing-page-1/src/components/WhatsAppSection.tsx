import { Ban, BellRing, UserPlus, Wallet } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { AutomationOrbit, type OrbitChip } from './AutomationOrbit';
import { ShinyText } from './ShinyText';
import { WhatsAppThread, type ThreadMessage } from './WhatsAppThread';

/* The three chips orbiting the phone, reusing MESSAGE_TYPES' icons so the ring
   visibly answers to the list beside it.
 
   Positions and arc dots are hand-placed rather than derived from an angle: the
   chips sit a little outside the ellipse with their dot on it, which is what the
   reference does, so solving for points on the curve would have fought the look.
   Dot coordinates are in the orbit SVG's 640x680 space, whose centre (320,340)
   lands on the phone's centre. */
/* Positions are set by bearing from the phone's centre, because that is what
   decides whether a chip is visible. The phone is 330px wide, so anything whose
   x falls inside ±165 is behind it; at these radii that hides any chip whose
   bearing is roughly 50-130 degrees or 230-310.
 
   All three sit near due-left or due-right with at least 20 degrees of headroom
   before their centre crosses into that band, which is what lets the sway run at
   ±20 without any of them disappearing:
 
     welcome  200 degrees, r 264   (was 216 — only 11 degrees of headroom)
     payment  169 degrees, r 248
     renewal  340 degrees, r 250   (was 334 — only 3 degrees of headroom)
 
   Radii stay in the 248-264 band. Anything further out and the chip clips the
   section's right edge at xl, which is overflow-hidden; keeping them close also
   reads as one shared orbit rather than chips flung to different distances.
 
   Dots are the point where each chip's bearing crosses the ellipse, so every chip
   has a node on the arc beside it. */
const ORBIT_CHIPS: readonly OrbitChip[] = [
  { icon: UserPlus, label: 'Welcome', position: '-left-[109px] top-[28%]', dot: { x: 94, y: 256 } },
  { icon: Wallet, label: 'Payment', position: '-left-[104px] top-[54%]', dot: { x: 86, y: 386 } },
  { icon: BellRing, label: 'Renewal', position: '-right-[95px] top-[29%]', dot: { x: 546, y: 256 } },
];

const MESSAGE_TYPES = [
  {
    icon: UserPlus,
    title: 'Welcome message',
    desc: 'Sent the moment a member joins, with their plan and expiry.',
    when: 'On joining',
    sample: 'Hi Naveen! Welcome to Fit Zone Gym. We’re excited to have you on board.',
  },
  {
    icon: BellRing,
    title: 'Renewal reminder',
    desc: 'Goes out before a membership lapses, not after.',
    when: 'Before expiry',
    sample: 'Hi Vignesh! A friendly reminder that your membership expires today.',
  },
  {
    icon: Wallet,
    title: 'Payment due alert',
    desc: 'Nudges the members who still owe, without you asking twice.',
    when: 'Every 3 days',
    sample: 'Hi Karthik, you have a pending payment of ₹3,000. Please clear your dues at the earliest.',
  },
] as const;

/* Verbatim from the live template, asterisk bolding and all, so what the phone
   shows is what a member actually receives.
 
   Kept separate from MESSAGE_TYPES rather than hanging off it: the list above
   describes behaviour in one line, this is the rendered artefact, with a banner,
   a details block and a sign-off. Sharing one field between the two shapes meant
   padding whichever one did not fit.
 
   Module scope, so the phone is not handed a newly allocated array per render.
 
   Just the welcome message. It is the one every member gets, and showing it
   alone means the phone depicts the true head of a new member's thread, which is
   why the mock now carries the date and encryption notices WhatsApp puts there. */
const THREAD: readonly ThreadMessage[] = [
  {
    banner: true,
    time: '11:50',
    footer: 'Powered by Gym Flow',
    body: `Hi Ganesh! 👋

Your membership has been successfully *activated*.

Member ID: *GF0086*
Membership Plan: *Annual (12 Months)*
Start Date: *07 Sep 2026*

Thank you for choosing *Fit zone gym*. We're excited to be part of your fitness journey.❤️`,
  },
];

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

  return (
    <section
      id="whatsapp"
      ref={scope}
      aria-labelledby="whatsapp-title"
      className="relative overflow-hidden border-y border-border-subtle bg-muted px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        {/* ── Claim + what it sends, beside the product itself ────────────
            Two columns that mean it. This used to be grid-cols-2 with the
            right-hand cell split again into a phone and a card column, so a
            600px half was doing the work of two columns: the phone took 300px
            and the message cards got what was left, which is why their copy
            wrapped to three lines and the whole side read as cramped. The
            message types now live with the copy they belong to, and the phone
            has the cell to itself. */}
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <span className="reveal eyebrow">WhatsApp automation</span>

            {/* "Unlimited" gets the same emphasis the hero gives "effortless":
                serif italic in the accent colour, with the shine sweeping through
                it. It is the load-bearing word in this section — the whole claim
                is that messaging is not metered — and reusing one treatment keeps
                the site to a single emphasis language rather than inventing a
                second one per section. */}
            <h2 id="whatsapp-title" className="reveal display-2 mt-4 text-balance">
              <em className="display-accent">
                <ShinyText text="Unlimited" speed={2.8} spread={120} />
              </em>{' '}
              WhatsApp.
              <br />
              <span className="text-muted-foreground">Built in, not billed extra.</span>
            </h2>

            {/* No longer enumerates the three message types. It used to list
                them in prose immediately above the cards that list them again,
                so the reader parsed the same three items twice. The "own
                number" line that used to float under the cards as a stray list
                item is folded in here instead. */}
            <p className="reveal lead mt-6 max-w-[520px]">
              Every GymFlow account includes fully automated WhatsApp messaging, with <ShinyText text="zero extra cost." speed={2.8} spread={120} />
            </p>

            {/* Cards again. They were bare icon-and-line rows, which read as a caption and
                left the left column thin beside the tall phone. Each card now also says
                when the message goes out and shows the message itself in a WhatsApp
                bubble, so the column carries real content and the phone has a list of
                what else it sends. Quiet surfaces, no hover lift: three boxes should
                not outweigh the phone they sit beside. */}
            <ul className="mt-8 flex flex-col gap-2.5">
              {MESSAGE_TYPES.map(type => {
                const Icon = type.icon;
                return (
                  <li key={type.title} className="reveal card px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-whatsapp-soft">
                        <Icon className="h-4 w-4 text-whatsapp-ink" />
                      </span>
                      <span className="min-w-0 flex-1 text-[14px] font-medium tracking-tight text-foreground">
                        {type.title}
                      </span>
                      <span className="shrink-0 rounded-pill bg-whatsapp-soft px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-whatsapp-ink">
                        {type.when}
                      </span>
                    </div>
                    <p className="mt-2.5 rounded-xl rounded-tl-sm bg-whatsapp-soft px-3 py-2 text-[12px] leading-snug text-foreground">
                      {type.sample}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Hidden below md. On a phone the mock stacks under the copy as a
              second full-width block that only restates what the three rows above
              already say, and it is the tallest thing in the section — so on the
              viewport with the least room it costs the most scroll for the least
              new information. The message rows and the price band carry the point
              on mobile; the device returns from md up where the grid gives it a
              column of its own. Hiding the wrapper also drops its bloom, tilt and
              orbit in one move.

              Capped at 300 (was 330): the mock holds a real 9/16 screen, so
              width drives height directly. Narrower than this and the banner
              image and the message text inside the thread start to feel cramped.
              A narrower phone also widens the orbit's visible arc — the band
              hidden behind it shrinks with its width — so the chips keep their
              clearance. */}
          {/* The phone and, under it, what the messages never cost. A column rather than
              the phone alone so the fee line has a place of its own on every screen: the
              phone is hidden below md, and this list stays. */}
          <div className="flex flex-col items-center gap-9 md:gap-12">
          <div className="reveal relative mx-auto hidden w-full max-w-[300px] shrink-0 md:block">
            {/* Soft green bloom — WhatsApp's own colour, kept to a backdrop so it
                never competes with the blue accent for brand attention. Also what
                fills the column either side of a phone this narrow. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-125"
              style={{
                background:
                  'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--whatsapp) 26%, transparent) 0%, transparent 68%)',
                filter: 'blur(12px)',
              }}
            />
            {/* Three nested elements, each owning exactly one job, because they
                all want the `transform` property and only one can have it:

                  phone-scene  perspective for the 3D tilt below
                  phone-bob    the animated float
                  phone-tilt   the static 3D rotation

                The orbit is a sibling of phone-bob rather than a child. It used
                to ride the same float, which made the ring look painted onto the
                device; on its own clock and easing it reads as surrounding it.
                It stays outside phone-tilt too — rotating the chips would skew
                their icons, and in the reference they read flat. */}
            <div className="phone-scene relative">
              <AutomationOrbit chips={ORBIT_CHIPS} />
              <div className="phone-bob">
                <div className="phone-tilt">
                  <WhatsAppThread messages={THREAD} />
                </div>
              </div>
            </div>
          </div>

            {/* Plain text again, set a little lower than the phone so the orbit's ring and the
                phone's shadow clear it. */}
            <ul className="reveal mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 md:mt-10">
              {NEVER_PAY_FOR.map(item => (
                <li key={item} className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <Ban className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  No {item.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
