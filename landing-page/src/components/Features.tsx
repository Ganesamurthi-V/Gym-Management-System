import { useState, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { Rise } from './fx';
import { CenterHead, Section } from './layout/Section';

/** Real captures of the owner console, cropped to the page content (no sidebar) so the text stays legible. */
function Capture({ name, alt }: { name: string; alt: string }) {
  return (
    <img
      src={`/feature/${name}.webp`}
      alt={alt}
      width={1200}
      height={571}
      loading="lazy"
      decoding="async"
      className="block size-full object-cover object-top"
    />
  );
}

/**
 * A screen that has no capture yet: shows a labelled placeholder. Save the screenshot as
 * public/feature/<name>.webp (1200 x 571, the page content without the sidebar, like members.webp)
 * and it replaces the placeholder with no code change.
 */
function Shot({ name, alt, label }: { name: string; alt: string; label: string }) {
  const [missing, setMissing] = useState(false);
  if (!missing) {
    return (
      <img
        src={`/feature/${name}.webp`}
        alt={alt}
        width={1200}
        height={571}
        loading="lazy"
        decoding="async"
        onError={() => setMissing(true)}
        className="block size-full object-cover object-top"
      />
    );
  }
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 border-2 border-dashed border-border-strong bg-subtle p-6 text-center">
      <ImageIcon aria-hidden className="size-7 text-muted-foreground" strokeWidth={1.5} />
      <p className="font-display text-[16px] font-medium text-foreground">{label}</p>
      <p className="max-w-[55%] break-words text-[13px] text-muted-foreground">Screenshot goes here: save it as public/feature/{name}.webp</p>
    </div>
  );
}

/*
  The home page's module overview (DESIGN.md, "Section kit" and "Detail rule"): every module an owner
  might ask about, each with its points and a link to its feature page. The four core modules are large
  panels that open with a real product screen; the other four are smaller panels. Every fact below is
  taken from src/data/featurePages.ts, so nothing here is a claim the feature pages do not already make.
*/

const CORE: {
  title: string;
  text: string;
  facts: { title: string; text: string }[];
  href: string;
  linkLabel: string;
  screen: ReactNode;
}[] = [
  {
    title: 'Member management',
    text: 'Members, attendance and fees in one place, so you know who is in, who owes and who is about to expire.',
    facts: [
      { title: 'Members', text: 'Every member shows as Active, Expiring or Expired, with search by name, phone number or member ID.' },
      { title: 'Attendance', text: 'A check-in kiosk at your desk where members type their member ID, and GymFlow records the visit and how long they stayed.' },
      { title: 'Fees and dues', text: 'Record fees by cash, UPI or card, and part payments stay as a pending due on the member.' },
    ],
    href: '/members',
    linkLabel: 'How member management works',
    screen: <Capture name="members" alt="The GymFlow members page: total, active, expired and overdue counts, search, filters and a list of members with plan, expiry date and status." />,
  },
  {
    title: 'Sales and operations',
    text: 'Sell products and run workouts from the same app that runs your memberships.',
    facts: [
      { title: 'Inventory', text: 'Add products with variants, each with its own SKU, cost price, selling price and stock.' },
      { title: 'Sales', text: "Record a sale with how it was paid, and see each product's sales history, units sold and revenue." },
      { title: 'Workout programs', text: 'Set the weeks, days per week, difficulty and goal, add exercises with sets, reps, weight and rest, then assign the program to chosen members.' },
    ],
    href: '/workout-programs',
    linkLabel: 'How workout programs work',
    screen: <Shot name="inventory" label="Inventory page" alt="The GymFlow inventory page: products with variants, stock and prices, and a sales history for each product." />,
  },
  {
    title: 'Member app',
    text: 'Give every member their own app on their phone, with no app store download.',
    facts: [
      { title: 'No app store', text: 'Opens from a WhatsApp link and installs to the home screen.' },
      { title: 'Membership card', text: 'A digital membership card with the plan and expiry date.' },
      { title: 'Workouts', text: 'Workouts you assign show up in the app, with each set listed and a rest timer.' },
      { title: 'Streaks and rewards', text: 'Streaks, leaderboards and rewards built from real attendance.' },
    ],
    href: '/member-app',
    linkLabel: 'How the member app works',
    screen: <Shot name="member-app-tablet" label="Member app, tablet view" alt="The GymFlow member app on a tablet: the member's plan, streak and workouts." />,
  },
];

/** The text link at the foot of every panel. The arrow moves by transform only. */
function FeatureLink({ href, children }: { href: string; children: string }) {
  const lastSpace = children.lastIndexOf(' ');
  return (
    <a href={href} className="group inline-block py-2.5 font-display text-[16px] font-medium text-accent-text hover:underline">
      {children.slice(0, lastSpace + 1)}
      <span className="whitespace-nowrap">
      {children.slice(lastSpace + 1)}
      <ArrowRight
        aria-hidden
        className="ml-1.5 inline-block size-4 align-[-3px] transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
        strokeWidth={2}
      />
      </span>
    </a>
  );
}

/** A small screen floating over the corner of the main one, like the cards over the laptop in the reference. */
function Float({ side, children, className = '' }: { side: 'left' | 'right'; children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={`absolute bottom-0 overflow-clip rounded-2xl border border-border-subtle bg-frame shadow-xl ${side === 'left' ? 'left-0' : 'right-0'} ${className}`}
    >
      {children}
    </div>
  );
}

const FLOAT: Record<string, { side: 'left' | 'right'; wide: boolean; node: ReactNode }> = {
  '/member-app': { side: 'right', wide: false, node: <div className="aspect-[9/19] w-[150px] lg:w-[200px]"><Shot name="member-app-mobile" label="Mobile view" alt="The GymFlow member app on a phone: the member's plan, streak and workouts." /></div> },
  '/members': { side: 'right', wide: true, node: <div className="aspect-[1200/571]"><Capture name="dues" alt="" /></div> },
  '/workout-programs': { side: 'left', wide: true, node: <div className="aspect-[1200/571]"><Shot name="workout-programs" label="Programs page" alt="" /></div> },
};

/**
 * Features: one row per core module, the screen on one side and the words on the other, flipping
 * sides row by row. Each row is a heading, one sentence, the facts as ruled lines and a link. A row with no capture yet shows a Shot placeholder.
 */
export function Features() {
  return (
    <Section id="features" labelledBy="features-title" tone="chalk">
      <CenterHead
        title={
          <h2 id="features-title" className="display-2 text-balance">
            {"Everything your gym's front desk does, in one app"}
          </h2>
        }
        lead="Run your members, your sales and your members' phones from one app."
      />

      <div className="mt-14 space-y-20 md:mt-20 md:space-y-28">
        {CORE.map((f, i) => {
          const fl = FLOAT[f.href];
          const flip = i % 2 === 1;
          return (
            <div key={f.href} className="grid items-center gap-x-16 gap-y-8 lg:grid-cols-12">
              <Rise className={`relative min-w-0 lg:col-span-7 ${flip ? 'lg:order-2 lg:-mr-14' : 'lg:-ml-14'}`}>
                <div className="relative pb-6 md:pb-8">
                  <div className="panel panel-lg overflow-clip">
                    <div className="aspect-[2.1] bg-frame">{f.screen}</div>
                  </div>
                  {fl && (
                    <Float side={fl.side} className={`${fl.side === 'left' ? 'md:-left-4' : 'md:-right-4'} ${fl.wide ? 'w-[58%] min-w-[210px] md:min-w-[300px]' : ''}`}>
                      {fl.node}
                    </Float>
                  )}
                </div>
              </Rise>

              <div className={`lg:col-span-5 ${flip ? 'lg:order-1' : ''}`}>
                <h3 className="font-display text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground md:text-[32px]">{f.title}</h3>
                <p className="mt-3 max-w-[48ch] text-[17px] leading-relaxed text-muted-foreground">{f.text}</p>
                <div className="mt-6 border-b border-border-subtle">
                  {f.facts.map(fact => (
                    <details key={fact.title} className="group border-t border-border-subtle">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-display text-[20px] font-medium leading-tight tracking-[-0.02em] text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                        {fact.title}
                        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
                      </summary>
                      <p className="pb-5 text-[16px] leading-relaxed text-muted-foreground">{fact.text}</p>
                    </details>
                  ))}
                </div>
                <FeatureLink href={f.href}>{f.linkLabel}</FeatureLink>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-16 text-center text-[14px] text-muted-foreground">Sample data in every screen.</p>
      <p className="mt-3 text-center text-[16px] text-muted-foreground">
        Both paid plans include everything on this page.{' '}
        <a href="#pricing" className="font-medium text-accent-text hover:underline">
          See pricing
        </a>
      </p>
    </Section>
  );
}
