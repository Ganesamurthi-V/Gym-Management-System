import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { FeatureArt, type FeatureStory } from './FeatureArt';
import { InventoryCard, MembersCard } from './MiniUI';
import { MemberAppCard } from './MemberAppCard';
import { Section, SectionHead } from './layout/Section';

/* Each product screen is a small live card drawn in HTML (MiniUI) floating on an animated panel (FeatureArt),
   sharp at every size and following the light and dark theme. It is decorative: aria-hidden, with one sr-only
   sentence describing it. */
function Screen({ describe, story, children }: { describe: string; story: FeatureStory; children: ReactNode }) {
  return (
    <div className="feature-media">
      <p className="sr-only">{describe}</p>
      <FeatureArt story={story}>{children}</FeatureArt>
    </div>
  );
}

/*
  The home page's module overview: the three core modules, each a heading, one sentence, a few facts, a link to
  its feature page and the product screen on the right. Every fact is taken from src/data/featurePages.ts, so
  nothing here is a claim the feature pages do not already make.
*/
const CORE: {
  label: string;
  title: string;
  text: string;
  facts: { title: string; text: string }[];
  href: string;
  linkLabel: string;
  screen: ReactNode;
}[] = [
  {
    label: 'Members',
    title: 'Member management',
    text: 'Know who is in, who owes and who is about to expire.',
    facts: [
      { title: 'Members', text: 'Every member shows as Active, Expiring or Expired.' },
      { title: 'Attendance', text: 'Members check in at a desk kiosk with their member ID, or on a fingerprint or face device.' },
      { title: 'Fees and dues', text: 'Record cash, UPI or card; part payments stay as a due.' },
    ],
    href: '/members',
    linkLabel: 'How member management works',
    screen: (
      <Screen story="members" describe="The GymFlow members page: total, active, expired and overdue counts, search, filters and a list of members with plan, expiry date and status.">
        <MembersCard />
      </Screen>
    ),
  },
  {
    label: 'Sales',
    title: 'Sales and operations',
    text: 'Sell products and run workouts from the app that runs your memberships.',
    facts: [
      { title: 'Inventory', text: 'Products with variants, each with its own SKU, price and stock.' },
      { title: 'Sales', text: 'Record how each sale was paid; see units sold and revenue.' },
      { title: 'Workout programs', text: 'Set weeks, days, exercises, sets and reps, then assign them to members.' },
    ],
    href: '/workout-programs',
    linkLabel: 'How workout programs work',
    screen: (
      <Screen story="inventory" describe="One GymFlow inventory product, a whey protein, with its variants, price and stock, and its units sold and revenue.">
        <InventoryCard />
      </Screen>
    ),
  },
  {
    label: 'Member app',
    title: 'Member app',
    text: 'Give every member their own app on their phone, with no app store download.',
    facts: [
      { title: 'No app store', text: 'Opens from a WhatsApp link and installs to the home screen.' },
      { title: 'Membership card', text: 'A digital card with the plan and expiry date.' },
      { title: 'Workouts', text: 'Assigned workouts show each set, with a rest timer.' },
      { title: 'Streaks and rewards', text: 'Built from real attendance.' },
    ],
    href: '/member-app',
    linkLabel: 'How the member app works',
    screen: (
      <Screen story="app" describe="The GymFlow member app home screen on a phone: a greeting, the active membership with days left, an attendance streak, a weekly goal and quick actions.">
        <MemberAppCard compact />
      </Screen>
    ),
  },
];

/**
 * Features: one row per core module, text left and the screen right on the page's split line, the same on
 * every row. The screen is a linked frame: its image zooms 1.02 on hover and the frame never moves.
 */
export function Features() {
  return (
    <Section id="features" labelledBy="features-title" tone="chalk">
      <SectionHead
        title={
          <h2 id="features-title" className="h2">
            {"Everything your gym's front desk does, in one app"}
          </h2>
        }
        lead="Run your members, your sales and your members' phones from one app."
      />

      <div className="feats">
        {CORE.map((f, i) => (
          <article key={f.href} className={`feature ${i % 2 === 1 ? 'feature--flip' : ''}`}>
            {f.screen}
            <div className="feature-copy">
              <span className="feat-label">{f.label}</span>
              <h3 className="h3">{f.title}</h3>
              <p className="mt-3 max-w-[40ch] text-[16px] leading-relaxed text-muted-foreground">{f.text}</p>
              <ul className="facts mt-6">
                {f.facts.map(fact => (
                  <li key={fact.title}>
                    <strong>{fact.title}</strong>
                    {fact.text}
                  </li>
                ))}
              </ul>
              <a href={f.href} className="link mt-2">
                <span>{f.linkLabel}</span>
                <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
              </a>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-12 text-[16px] text-muted-foreground">
        Both paid plans include everything on this page.{' '}
        <a href="#pricing" className="link">
          <span>See pricing</span>
        </a>
      </p>
    </Section>
  );
}
