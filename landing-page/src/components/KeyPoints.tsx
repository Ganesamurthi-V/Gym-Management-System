import { CountOnView, RiseGroup } from './fx';
import { Section } from './layout/Section';
import { FREE_MEMBER_LIMIT } from '../data/plans';
import '../styles/facts.css';

/* The main points, highlighted (owner's request). Every figure is a product fact stated in
   src/data/featurePages.ts; the free limit comes from plans.ts. */
const FIGURES = [
  { value: 18, suffix: ' days', text: 'before a plan ends, the first WhatsApp reminder goes out' },
  { value: 3, suffix: ' days', text: 'between reminders, up to 7 times, until the member renews' },
  { value: FREE_MEMBER_LIMIT, suffix: ' members', text: 'free forever, with fees, dues and attendance', free: true },
  { value: 500, suffix: ' members', text: 'in one Excel or CSV import, checked in a preview first' },
] as const;

/**
 * Four giant numerals under a 4px bar rule, divided by bar rules. Each rises once in view and
 * counts up once; the free-plan figure sits on the one block of Royal Blue. Purpose follows on
 * the same ground.
 */
export function KeyPoints() {
  return (
    <Section labelledBy="facts-title" className="pb-12 md:pb-12">
      <h2 id="facts-title" className="sr-only">
        GymFlow in four numbers
      </h2>

      <div aria-hidden className="bar-rule" />
      <RiseGroup className="facts-row">
        {FIGURES.map(figure => (
          <dl key={figure.text} className={`fact${'free' in figure ? ' fact--free' : ''}`}>
            <dt className="sr-only">{`${figure.value}${figure.suffix}`}</dt>
            <dd aria-hidden>
              <span className="fact-num figure-xl block">
                <CountOnView to={figure.value} duration={1.6} />
              </span>
              <span className="fact-unit">{figure.suffix.trim()}</span>
            </dd>
            <dd className="fact-text">{figure.text}</dd>
          </dl>
        ))}
      </RiseGroup>
    </Section>
  );
}
