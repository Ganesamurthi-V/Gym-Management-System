import CountUp from './ui/CountUp';
import ScrollVelocity from './ui/ScrollVelocity';
import { FREE_MEMBER_LIMIT } from '../data/plans';

/* The main points, highlighted (owner's request). Every figure is a product fact stated in
   src/data/featurePages.ts; the free limit comes from plans.ts. */
const FIGURES = [
  { value: 18, suffix: ' days', text: 'before a plan ends, the first WhatsApp reminder goes out' },
  { value: 3, suffix: ' days', text: 'between reminders, up to 7 times, until the member renews' },
  { value: FREE_MEMBER_LIMIT, suffix: ' members', text: 'free forever, with fees, dues and attendance' },
  { value: 500, suffix: ' members', text: 'in one Excel or CSV import, checked in a preview first' },
] as const;

const POINTS = [
  'Renewals tracked',
  'Dues collected',
  'Attendance counted',
  'Reminders sent on WhatsApp',
  'Reports in plain English',
  'Built for gyms in India',
];

/**
 * A ticker of what GymFlow does (React Bits ScrollVelocity: it moves faster as the visitor scrolls,
 * so the motion answers the scroll rather than looping on its own), then the four figures, which
 * count up once when they come into view (React Bits CountUp, which honours reduced motion).
 */
export function KeyPoints() {
  return (
    <section aria-labelledby="facts-title" className="relative overflow-hidden border-y border-border-subtle bg-frame py-14 md:py-20">
      <h2 id="facts-title" className="sr-only">
        GymFlow in four numbers
      </h2>

      <div aria-hidden className="[font-stretch:70%]">
        <ScrollVelocity
          texts={[POINTS.join('   /   ') + '   /   ']}
          velocity={36}
          numCopies={4}
          fontSize="clamp(34px, 5.4vw, 72px)"
          fontWeight={800}
          color="var(--foreground)"
          outlineAlternate
          fadeEdges
        />
      </div>

      <dl className="mx-auto mt-12 grid max-w-[1200px] gap-x-10 gap-y-10 px-5 sm:grid-cols-2 md:mt-16 md:px-8 lg:grid-cols-4">
        {FIGURES.map(figure => (
          <div key={figure.text} className="border-l-2 border-accent pl-5">
            <dt className="sr-only">{`${figure.value}${figure.suffix}`}</dt>
            <dd aria-hidden className="display-2 text-accent-text tabular-nums">
              <CountUp to={figure.value} duration={1.6} separator="," />
              <span className="text-[0.5em] font-bold">{figure.suffix}</span>
            </dd>
            <dd className="mt-3 max-w-[30ch] text-[15px] leading-relaxed text-muted-foreground">{figure.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
