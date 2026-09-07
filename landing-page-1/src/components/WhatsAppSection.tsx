import { Ban, BellRing, UserPlus, Wallet } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { AutomationOrbit, type OrbitChip } from './AutomationOrbit';
import { WhatsAppThread, type ThreadMessage } from './WhatsAppThread';

/* The three chips orbiting the phone, reusing MESSAGE_TYPES' icons so the ring
   visibly answers to the list beside it.
 
   Positions and arc dots are hand-placed rather than derived from an angle: the
   chips sit a little outside the ellipse with their dot on it, which is what the
   reference does, so solving for points on the curve would have fought the look.
   Dot coordinates are in the orbit SVG's 640x680 space, whose centre (320,340)
   lands on the phone's centre. */
/* Radii matter now that rotation is continuous: each chip sweeps a full circle,
   so its distance from the phone's centre sets how far it reaches at the extremes
   of that circle, not just where it happens to sit at rest.
 
   The welcome chip used to sit 291px out — 40px further than the other two — and
   swung to due-right that put its edge 4px past the section, which is
   overflow-hidden and would have sliced it at xl. Pulled in to ~264 it clears,
   and the three radii (264 / 248 / 249) now read as one shared orbit rather than
   one chip flung wider than its siblings. */
const ORBIT_CHIPS: readonly OrbitChip[] = [
  { icon: UserPlus, label: 'Welcome', position: '-left-[74px] top-[16%]', dot: { x: 121, y: 193 } },
  { icon: Wallet, label: 'Payment', position: '-left-[104px] top-[54%]', dot: { x: 114, y: 474 } },
  { icon: BellRing, label: 'Renewal', position: '-right-[86px] top-[33%]', dot: { x: 543, y: 248 } },
];

const MESSAGE_TYPES = [
  {
    icon: UserPlus,
    title: 'Welcome message',
    desc: 'Sent the moment a member joins, with their plan and expiry.',
  },
  {
    icon: BellRing,
    title: 'Renewal reminder',
    desc: 'Goes out before a membership lapses, not after.',
  },
  {
    icon: Wallet,
    title: 'Payment due alert',
    desc: 'Nudges the members who still owe, without you asking twice.',
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

            <h2 id="whatsapp-title" className="reveal display-2 mt-4 text-balance">
              Unlimited WhatsApp.
              <br />
              <span className="text-muted-foreground">Built in, not billed extra.</span>
            </h2>

            {/* No longer enumerates the three message types. It used to list
                them in prose immediately above the cards that list them again,
                so the reader parsed the same three items twice. The "own
                number" line that used to float under the cards as a stray list
                item is folded in here instead. */}
            <p className="reveal lead mt-6 max-w-[520px]">
              Every GymFlow account includes fully automated WhatsApp messaging, sent from
              your gym&apos;s own number.
            </p>

            {/* Bare rows, not cards. With border, background and a hover lift
                these were three more boxes competing with the phone and the
                comparison block for the same attention; stripped back they read
                as a caption to the phone, which is what they are. */}
            <ul className="mt-9 flex flex-col gap-6">
              {MESSAGE_TYPES.map(type => {
                const Icon = type.icon;
                return (
                  <li key={type.title} className="reveal flex gap-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-whatsapp-soft">
                      <Icon className="h-4 w-4 text-whatsapp-ink" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-foreground">
                        {type.title}
                      </span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
                        {type.desc}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Capped at 330: the mock holds a real 9/16 screen, so width drives
              height directly — at 400 the phone would stand 710px tall and
              tower over the 540px copy column beside it. */}
          <div className="reveal relative mx-auto w-full max-w-[330px] shrink-0">
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
        </div>

        {/* ── The commercial argument ─────────────────────────────────────
            Promoted out of the left column into a full-width band. This is the
            reason the section exists, and it was the smallest, lowest-contrast
            thing on screen, tucked into a bottom corner. As a band it closes
            the section — claim, what it sends, then what it costs — and the one
            saturated blue lands in the middle of the composition instead of in
            the bottom-left corner. */}
        <div className="reveal card mt-16 overflow-hidden md:mt-20">
          <div className="grid md:grid-cols-3">
            <div className="border-b border-border-subtle p-6 md:border-b-0 md:border-r">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Typical gym platform
              </p>
              <p className="mt-3 text-[30px] font-medium tracking-tight text-foreground">
                <span className="text-[21px] text-muted-foreground">₹</span>0.30–1
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                per message. At 200 members that runs into thousands a month, just on
                notifications.
              </p>
            </div>

            {/* Centre cell, so the block a visitor should remember sits at the
                optical centre of the band rather than at one end.

                bg-card-primary rather than bg-accent: this cell carries two
                levels of white text, and --accent is too light a blue to keep
                the dimmer level above AA. */}
            <div className="bg-card-primary p-6">
              <p className="font-mono text-[10px] uppercase tracking-wider text-accent-ink/80">
                GymFlow
              </p>
              <p className="mt-3 text-[30px] font-medium tracking-tight text-accent-ink">
                Included
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-accent-ink/80">
                Unlimited messages at zero extra cost, on every account.
              </p>
            </div>

            <div className="border-t border-border-subtle p-6 md:border-l md:border-t-0">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                What you never pay for
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {NEVER_PAY_FOR.map(item => (
                  <li
                    key={item}
                    className="flex items-center gap-2.5 text-[13px] font-medium text-foreground"
                  >
                    <Ban className="h-3.5 w-3.5 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
