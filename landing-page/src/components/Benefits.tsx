import { CountOnView, RiseGroup } from './fx';
import { RuledList, Section } from './layout/Section';
import '../styles/benefits.css';

const APP_URL = 'https://app.gymflow.sbs';

const ITEMS = [
  {
    title: 'Less chasing',
    text: 'Reminders go out on WhatsApp by themselves and stop when you record the renewal or the payment.',
  },
  {
    title: 'Know where you stand each morning',
    text: 'Every member is marked Active, Expiring or Expired.',
  },
  {
    title: 'Members get their own app',
    text: 'A member app with a digital card, workout programs and attendance streaks.',
  },
] as const;

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const count = (n: number) => String(Math.round(n));

// Sample data, as the dashboard mock below shows.
const FIGURES = [
  { label: 'Active members', to: 248, format: count },
  { label: "Today's collection", to: 12400, format: inr },
  { label: 'Expiring soon', to: 9, format: count },
  { label: 'Outstanding dues', to: 18600, format: inr },
] as const;

/** The one graphite band: four figures, the dashboard shown large, three short rows. */
export function Benefits() {
  return (
    <Section id="dashboard" labelledBy="dashboard-title" tone="ink">
      <div className="min-w-0 max-w-[720px]">
        <h2 id="dashboard-title" className="display-1 min-w-0 break-words">
          Your whole gym on one dashboard
        </h2>
        <p className="lead mt-6 max-w-[56ch] text-muted-foreground">
          Active members, today&apos;s collection, memberships expiring soon and outstanding dues, on one screen.
        </p>
      </div>

      <RiseGroup className="dash-figures mt-14 md:mt-20">
        {FIGURES.map(f => (
          <dl key={f.label} className="dash-figure-cell">
            <dd className="figure-xl dash-figure-num">
              <CountOnView to={f.to} format={f.format} duration={1.8} />
            </dd>
            <dt className="dash-figure-label">{f.label}</dt>
          </dl>
        ))}
      </RiseGroup>

      <p className="mt-6 text-[14px] text-muted-foreground">Sample data</p>

      <div className="dash-list mt-10 md:mt-14">
        <RuledList items={ITEMS} />
      </div>

      <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <a href={APP_URL} className="btn btn-primary btn-lg">
          Start free trial
        </a>
        <a href="/features" className="btn btn-outline btn-lg">
          See all features
        </a>
      </div>
    </Section>
  );
}
