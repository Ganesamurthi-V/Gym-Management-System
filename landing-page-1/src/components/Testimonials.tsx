import { ArrowUpRight, Smartphone, Star } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

/*
  A results wall, not a carousel.

  This was an auto-scrolling marquee of six identical cards. Identical cards read as
  filler: nothing says which story matters, and a moving row cannot be read without
  chasing it. Each of these owners already leads with a number — two hours, ten
  minutes, double, thirty percent — so the layout lets the number be the headline:

    · one large featured story, the one every gym owner recognises (notebooks → one tab)
    · four result tiles, the figure first and the quote beneath it as proof
    · one wide closing strip for the owner who runs it from a phone

  Different sizes give the eye a route through six quotes instead of six equal
  stops, and nothing moves, so a visitor reads at their own pace.

  The figures are the ones already stated in each owner's own quote; none were
  added. They sit in `stat` so the layout does not depend on parsing a sentence.
*/
const TESTIMONIALS = [
  {
    highlight: 'From 4 notebooks to 1 tab',
    quote:
      'Before GymFlow I had 4 notebooks. Now I open one tab. Dues used to slip through — not anymore.',
    author: 'Arun Kumar',
    role: 'Owner',
    gym: 'Iron Arena',
  },
  {
    highlight: 'Saves 2 hours every week',
    stat: '2 hrs',
    statLabel: 'saved every week',
    quote:
      'The WhatsApp reminder feature alone saves me 2 hours every week. Members actually pay on time now.',
    author: 'Priya Devi',
    role: 'Owner',
    gym: 'FitZone',
  },
  {
    highlight: '300 members imported in 10 min',
    stat: '10 min',
    statLabel: 'to import 300 members',
    quote:
      'Imported 300 members from Excel in 10 minutes. It matched my columns straight away and let me check everything before saving.',
    author: 'Suresh Kumar',
    role: 'Owner',
    gym: 'Strength Lab',
  },
  {
    highlight: 'Renewals doubled',
    stat: '2×',
    statLabel: 'renewal rate',
    quote:
      'Automatic renewal reminders brought back members who used to just disappear. My renewal rate has nearly doubled since.',
    author: 'Naveen Raj',
    role: 'Owner',
    gym: 'Pulse Fitness',
  },
  {
    highlight: 'Collections up 30%',
    stat: '+30%',
    statLabel: 'collections',
    quote:
      'I can see exactly who owes what at a glance. Chasing dues used to be guesswork — collections are up about 30% now.',
    author: 'Vignesh R',
    role: 'Manager',
    gym: 'BeastMode Gym',
  },
  {
    highlight: 'Runs it all from my phone',
    quote:
      'Attendance, payments, reminders — I run the whole gym from my phone between sets. My front desk is basically paperless.',
    author: 'Deepak S',
    role: 'Owner',
    gym: 'Core Studio',
  },
] as const;

type Testimonial = (typeof TESTIMONIALS)[number];
type WithStat = Extract<Testimonial, { stat: string }>;

const byAuthor = (name: string) => TESTIMONIALS.find(t => t.author === name)!;
const RESULTS = TESTIMONIALS.filter((t): t is WithStat => 'stat' in t);

function Stars({ name }: { name: string }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" role="img" aria-label={`${name} rated 5 out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-3 w-3 fill-accent text-accent" />
      ))}
    </span>
  );
}

function Byline({ item }: { item: Testimonial }) {
  return (
    <figcaption className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-foreground">{item.author}</span>
        <span className="block truncate text-[12px] text-muted-foreground">
          {item.role} @ {item.gym}
        </span>
      </span>
      <Stars name={item.author} />
    </figcaption>
  );
}

/** The lead story: set large, in the serif the rest of the site uses for emphasis. */
function Featured({ item }: { item: Testimonial }) {
  return (
    <figure className="reveal card-accent relative flex flex-col overflow-hidden p-8 max-md:w-[86%] max-md:shrink-0 max-md:snap-center md:col-span-2 md:p-10 lg:col-span-6 lg:row-span-2">
      {/* A giant quote mark as a shape, not an icon: it fills the corner and gives
          the card its weight without adding another box. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-10 select-none font-serif text-[300px] leading-none opacity-[0.14]"
      >
        &rdquo;
      </span>
      <span className="relative flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] opacity-80">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        {item.highlight}
      </span>
      {/* my-auto, not flex-1: the card is two result tiles tall, so the quote sits in the
          middle of the space between the label and the byline instead of hugging the top
          and leaving a blue void under it. */}
      <blockquote className="relative my-auto py-10 font-serif text-[30px] italic leading-[1.18] tracking-[-0.01em] md:text-[40px] lg:text-[46px]">
        &ldquo;{item.quote}&rdquo;
      </blockquote>
      <figcaption className="relative flex items-end justify-between gap-4 border-t border-white/20 pt-6">
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium">{item.author}</span>
          <span className="block truncate text-[12.5px] opacity-75">
            {item.role} @ {item.gym}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5" role="img" aria-label={`${item.author} rated 5 out of 5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-current" />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

/** A result: the figure is the headline, the owner's words are the evidence. */
function Result({ item, phone }: { item: WithStat; phone: boolean }) {
  return (
    <figure
      className={`reveal card card-hover flex flex-col p-6 md:p-7 lg:col-span-3 ${
        phone ? 'max-md:w-[86%] max-md:shrink-0 max-md:snap-center' : 'max-md:hidden'
      }`}
    >
      <span className="text-[44px] font-medium leading-none tracking-[-0.04em] text-accent-text md:text-[52px]">
        {item.stat}
      </span>
      <span className="mt-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {item.statLabel}
      </span>
      <blockquote className="mt-5 flex-1 text-[14px] leading-relaxed text-muted-foreground">
        &ldquo;{item.quote}&rdquo;
      </blockquote>
      <div className="mt-6 border-t border-border-subtle pt-5">
        <Byline item={item} />
      </div>
    </figure>
  );
}

/** The wide closer, for the owner whose point is where he runs it from. */
function Strip({ item }: { item: Testimonial }) {
  return (
    <figure className="reveal card card-hover flex flex-col gap-6 p-6 max-md:hidden md:col-span-2 md:flex-row md:items-center md:gap-10 md:p-8 lg:col-span-12">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent-soft" aria-hidden>
        <Smartphone className="h-6 w-6 text-accent-text" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {item.highlight}
        </span>
        <blockquote className="mt-2 text-[16px] leading-relaxed text-foreground md:text-[18px]">
          &ldquo;{item.quote}&rdquo;
        </blockquote>
      </div>
      <div className="shrink-0 md:w-[210px]">
        <Byline item={item} />
      </div>
    </figure>
  );
}

export function Testimonials() {
  const scope = useReveal<HTMLElement>({ stagger: 0.08 });

  return (
    <section
      id="testimonials"
      ref={scope}
      aria-labelledby="testimonials-title"
      className="relative overflow-hidden border-y border-border-subtle bg-muted px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        {/* Header: left-aligned on a wide screen with the rating beside it, so the
            section opens with the same rhythm as the ones around it instead of a
            centred block. Centred again on a phone. */}
        <div className="flex flex-col items-center gap-8 text-center lg:flex-row lg:items-end lg:justify-between lg:text-left">
          <div>
            <span className="reveal eyebrow">What gym owners say</span>
            <h2 id="testimonials-title" className="reveal display-2 mt-4 text-balance">
              Real gyms.
              <br />
              Real <em className="display-accent">results.</em>
            </h2>
          </div>
          <div className="reveal inline-flex items-center gap-2.5 rounded-pill border border-border-subtle bg-frame px-4 py-2">
            <span className="flex items-center gap-0.5" role="img" aria-label="Rated 5 out of 5">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="h-4 w-4 fill-accent text-accent" />
              ))}
            </span>
            <span className="text-[13px] font-medium text-foreground">Loved by independent gyms across India</span>
          </div>
        </div>

        {/* On a phone this is a swipe row of three — the featured story and the first two
            results — and the rest are hidden. Six stacked cards were 2,400px of scrolling
            on a 390px screen, which is more than the rest of the section's job is worth;
            three snap-aligned cards carry the same proof in one screen of height. From md
            up it is the grid again, with all six. The row bleeds to the screen edges
            (-mx-5 cancels the section's gutter) so the next card is visibly there. */}
        <div className="-mx-5 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] md:mx-0 md:mt-12 md:grid md:snap-none md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-12 [&::-webkit-scrollbar]:hidden">
          <Featured item={byAuthor('Arun Kumar')} />
          {RESULTS.map((item, i) => (
            <Result key={item.author} item={item} phone={i < 2} />
          ))}
          <Strip item={byAuthor('Deepak S')} />
        </div>
      </div>
    </section>
  );
}
