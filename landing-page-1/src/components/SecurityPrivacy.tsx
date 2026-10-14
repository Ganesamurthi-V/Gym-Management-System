import { Lock, ShieldCheck } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

const LINK_CLASS =
  'rounded font-medium text-accent-text underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/* Only facts checked against the product code. Anything not listed here (encryption
   at rest, backups, uptime figures, certifications) is deliberately not claimed. */
const SECURITY = [
  "Each gym's data is separated from every other gym's.",
  'Owner and member accounts are separate roles with separate access.',
  'Sign-in is protected by limits on repeated attempts.',
  'Connections are encrypted (HTTPS).',
  'The app uses security headers that browsers enforce.',
] as const;

const PRIVACY = [
  'What we collect: member name, phone, email, gender, area, date of birth, attendance, payments, and the gym’s UPI ID.',
  'It is used only to run the gym.',
  'It is processed by trusted service providers (Supabase, Vercel, Meta WhatsApp and others listed in the Privacy Policy).',
  'Owners can export members, attendance and payments to Excel, and reports to PDF.',
  'Owners can delete all members, or their whole gym, from account settings. A one-time code confirms it.',
] as const;

function Panel({
  id,
  icon: Icon,
  title,
  items,
  children,
}: {
  id?: string;
  icon: typeof Lock;
  title: string;
  items: readonly string[];
  children?: React.ReactNode;
}) {
  return (
    <div id={id} className="reveal card scroll-mt-24 p-6 md:p-8">
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-border-subtle bg-subtle">
        <Icon aria-hidden className="h-5 w-5 text-accent-text" />
      </span>
      <h3 className="display-3 mt-5">{title}</h3>
      <ul className="mt-5 flex flex-col gap-3">
        {items.map(item => (
          <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-muted-foreground">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {item}
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

export function SecurityPrivacy() {
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });

  return (
    <section
      id="security"
      ref={scope}
      aria-labelledby="security-title"
      className="scroll-mt-24 px-5 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto max-w-[1240px]">
        <span className="reveal eyebrow">Security and privacy</span>
        <h2 id="security-title" className="reveal display-2 mt-4 max-w-[720px] text-balance">
          How your gym&rsquo;s data is handled.
        </h2>
        <p className="reveal lead mt-5 max-w-[560px]">
          Plain answers to what is protected, what is collected and what you can do with it.
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <Panel icon={ShieldCheck} title="Security" items={SECURITY} />
          <Panel id="privacy-data" icon={Lock} title="Privacy and data" items={PRIVACY}>
            <p className="mt-6 text-[13px] text-muted-foreground">
              Read the full{' '}
              <a href="/privacy" className={LINK_CLASS}>
                Privacy Policy
              </a>{' '}
              and{' '}
              <a href="/terms" className={LINK_CLASS}>
                Terms
              </a>
              .
            </p>
          </Panel>
        </div>

        <p className="reveal mt-6 text-[13px] text-muted-foreground">
          GymFlow does not currently hold any independent security certification or audit.
        </p>
      </div>
    </section>
  );
}
