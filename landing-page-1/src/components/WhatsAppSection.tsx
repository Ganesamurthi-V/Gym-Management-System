import { Ban, BellRing, MessageSquare, UserPlus, Wallet } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

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

const NOT_INCLUDED = [
  'No per-message fees',
  'No monthly caps',
  'No third-party integration to set up',
] as const;

export function WhatsAppSection() {
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });

  return (
    <section
      id="whatsapp"
      ref={scope}
      className="relative overflow-hidden border-y border-border-subtle bg-muted px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
        {/* ── Copy ──────────────────────────────────────────────────────── */}
        <div>
          <span className="reveal eyebrow">WhatsApp automation</span>

          <h2 className="reveal display-2 mt-4 text-balance">
            Unlimited WhatsApp.
            <br />
            <span className="text-muted-foreground">Built in, not billed extra.</span>
          </h2>

          <p className="reveal lead mt-6 max-w-[520px]">
            Every GymFlow account includes fully automated WhatsApp messaging — welcome
            notes when a member joins, renewal reminders before a plan expires, and payment
            due alerts.
          </p>

          {/* The commercial argument, given its own block because it is the
              actual reason this section exists. */}
          <div className="reveal card mt-8 max-w-[520px] overflow-hidden">
            <div className="grid sm:grid-cols-2">
              <div className="border-b border-border-subtle p-5 sm:border-b-0 sm:border-r">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Typical gym platform
                </p>
                <p className="mt-2.5 text-[26px] font-medium tracking-tight text-foreground">
                  <span className="text-[19px] text-muted-foreground">₹</span>0.30–1
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  per message. At 200 members that runs into thousands a month, just on
                  notifications.
                </p>
              </div>
              <div className="bg-accent p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-accent-ink/70">
                  GymFlow
                </p>
                <p className="mt-2.5 text-[26px] font-medium tracking-tight text-accent-ink">
                  Included
                </p>
                <p className="mt-1 text-[11.5px] text-accent-ink/75">
                  Unlimited messages at zero extra cost, on every account.
                </p>
              </div>
            </div>
          </div>

          <ul className="reveal mt-7 flex flex-wrap gap-x-6 gap-y-2.5">
            {NOT_INCLUDED.map(item => (
              <li
                key={item}
                className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground"
              >
                <Ban className="h-3.5 w-3.5 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Phone + message types ─────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-8">
          <div className="reveal relative w-full max-w-[300px] shrink-0">
            {/* Soft green bloom — WhatsApp's own colour, kept to a backdrop so it
                never competes with the lime accent for brand attention. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-125"
              style={{
                background:
                  'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--whatsapp) 26%, transparent) 0%, transparent 68%)',
                filter: 'blur(12px)',
              }}
            />
            <img
              src="/Whatsapp_phone.webp"
              alt="A phone showing an automated GymFlow renewal reminder delivered over WhatsApp."
              width={880}
              height={1320}
              loading="lazy"
              decoding="async"
              className="animate-float relative block w-full object-contain drop-shadow-2xl"
            />
          </div>

          <ul className="flex w-full flex-col gap-3">
            {MESSAGE_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <li key={type.title} className="reveal card card-hover flex gap-3.5 p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-whatsapp-soft">
                    <Icon className="h-4 w-4 text-whatsapp-ink" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-foreground">
                      {type.title}
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-muted-foreground">
                      {type.desc}
                    </span>
                  </span>
                </li>
              );
            })}
            <li className="reveal flex items-center gap-2 pt-1 pl-1">
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-whatsapp" />
              <span className="text-[12px] text-muted-foreground">
                Sent from your gym&apos;s own WhatsApp number.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
