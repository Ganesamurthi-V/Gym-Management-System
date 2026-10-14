import { ArrowRight, Database, Headset, ScrollText, ShieldCheck } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { SUPPORT_PROMISE } from '../data/support';

const LINK_CLASS =
  'rounded font-medium text-accent-text underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/* Every line is limited to what the product does today; the longer version of each
   lives in the Security and privacy section and the Pricing details. */
const ITEMS = [
  {
    icon: ShieldCheck,
    title: 'Security-conscious design',
    desc: "Each gym's data is kept separate, and sign-in is protected with limits on repeated attempts.",
    links: [{ label: 'How we protect data', href: '#security' }],
  },
  {
    icon: Database,
    title: 'Your data, your control',
    desc: 'Export to Excel and PDF. Owners can delete their gym’s data.',
    links: [{ label: 'Privacy and data', href: '#privacy-data' }],
  },
  {
    icon: Headset,
    title: 'Real human support',
    desc: SUPPORT_PROMISE,
    links: [{ label: 'Contact support', href: '#support' }],
  },
  {
    icon: ScrollText,
    title: 'Transparent policies',
    desc: 'Privacy, Terms, pricing and cancellation are written out in plain words.',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
] as const;

export function TrustStrip() {
  const scope = useReveal<HTMLElement>({ stagger: 0.08 });

  return (
    <section
      ref={scope}
      aria-labelledby="trust-title"
      className="px-5 py-16 md:px-8 md:py-20"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 id="trust-title" className="reveal display-2 text-balance">
            Your Gym. Your Data. Your Control.
          </h2>
          <p className="reveal lead mx-auto mt-5 max-w-[560px]">
            Manage your gym with confidence, backed by transparent security practices and
            dedicated support.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="reveal card flex flex-col p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-border-subtle bg-subtle">
                  <Icon aria-hidden className="h-5 w-5 text-accent-text" />
                </span>
                <h3 className="mt-5 text-[15.5px] font-medium tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
                <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-[13px]">
                  {item.links.map(link => (
                    <a key={link.href} href={link.href} className={LINK_CLASS}>
                      {link.label}
                    </a>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="reveal mt-10 flex justify-center">
          <a href="#demo" className="btn btn-primary btn-lg">
            Explore the Demo
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
