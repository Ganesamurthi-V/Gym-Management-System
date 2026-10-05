import { Star, Quote } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

/*
  An auto-scrolling testimonial marquee.

  History: this was a click-to-reveal carousel (one quote behind avatar tabs), then a
  static three-card grid. It is now a horizontal loop that drifts on its own and pauses
  when the pointer is over the row, so a visitor can stop on any card to read it. Social
  proof reads best in volume and in motion — a moving wall of quotes signals "lots of
  gyms use this" more than three fixed cards do.

  The animation reuses the site's existing marquee primitive from index.css
  (@keyframes marquee + .animate-marquee + .marquee-track:hover pause + the
  reduced-motion opt-out), rather than a bespoke one — same seamless -50% loop the
  logo strip uses, so the two behave identically and there is one thing to maintain.

  The avatar initials badge was removed on request; attribution is now just the
  owner's name and gym, which keeps each card lighter and lets more fit in view.
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
  quote:
    'The WhatsApp reminder feature alone saves me 2 hours every week. Members actually pay on time now.',
  author: 'Priya Devi',
  role: 'Owner',
  gym: 'FitZone',
},
{
  highlight: '300 members imported in 10 min',
  quote:
    'Imported 300 members from Excel in 10 minutes. It matched my columns straight away and let me check everything before saving.',
  author: 'Suresh Kumar',
  role: 'Owner',
  gym: 'Strength Lab',
},
{
  highlight: 'Renewals doubled',
  quote:
    'Automatic renewal reminders brought back members who used to just disappear. My renewal rate has nearly doubled since.',
  author: 'Naveen Raj',
  role: 'Owner',
  gym: 'Pulse Fitness',
},
{
  highlight: 'Collections up 30%',
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

function TestimonialCard({ item }: { item: Testimonial }) {
  return (
    <li className="card card-hover flex w-[300px] shrink-0 flex-col p-6 text-left sm:w-[340px] md:p-7">
      {/* A faint quote mark anchors the card as a testimonial at a glance. */}
      <Quote className="h-7 w-7 shrink-0 text-accent/25" aria-hidden />

      <p className="mt-4 text-[15px] font-semibold leading-snug text-foreground">
        {item.highlight}
      </p>

      <blockquote className="mt-2.5 flex-1 text-[14px] leading-relaxed text-muted-foreground">
        &ldquo;{item.quote}&rdquo;
      </blockquote>

      {/* Attribution — name + gym only now the avatar badge is gone — plus the
          per-card 5-star rating. */}
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle pt-5">
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium text-foreground">
            {item.author}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {item.role} @ {item.gym}
          </span>
        </span>
        <span
          className="flex shrink-0 items-center gap-0.5"
          role="img"
          aria-label={`${item.author} rated 5 out of 5`}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className="h-3 w-3 fill-accent text-accent" />
          ))}
        </span>
      </div>
    </li>
  );
}

export function Testimonials() {
  const scope = useReveal<HTMLElement>({ stagger: 0.1 });

  return (
    <section
      id="testimonials"
      ref={scope}
      aria-labelledby="testimonials-title"
      className="relative overflow-hidden border-y border-border-subtle bg-muted py-24 md:py-28"
    >
      {/* Header stays centred and padded; the marquee below runs full-bleed. */}
      <div className="mx-auto max-w-[720px] px-5 text-center md:px-8">
        <span className="reveal eyebrow">What gym owners say</span>
        <h2 id="testimonials-title" className="reveal display-2 mt-4 text-balance">
          Real gyms. <span className="text-muted-foreground">Real results.</span>
        </h2>

        {/* Aggregate rating up top, so the section opens on a single strong
            social-proof signal before the individual stories. */}
        <div className="reveal mt-6 inline-flex items-center gap-2.5 rounded-pill border border-border-subtle bg-frame px-4 py-2">
          <span className="flex items-center gap-0.5" role="img" aria-label="Rated 5 out of 5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className="h-4 w-4 fill-accent text-accent" />
            ))}
          </span>
          <span className="text-[13px] font-medium text-foreground">
            Loved by independent gyms across India
          </span>
        </div>
      </div>

      {/* ── Auto-scrolling marquee ────────────────────────────────────────────
          marquee-track is the hover target (index.css pauses .animate-marquee inside
          it on hover, so resting the cursor anywhere over the row — and thus over a
          card — stops the loop). The edge-fade mask keeps cards from hard-cutting at
          the viewport edges. The track holds the list TWICE so the -50% loop lands on
          an identical frame with no visible seam. */}
      <div
        className="marquee-track reveal group relative mt-12 flex overflow-hidden [--marquee-duration:38s]"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)',
          maskImage:
            'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)',
        }}
      >
        <ul
          className="animate-marquee flex shrink-0 items-stretch gap-4 pr-4 md:gap-5 md:pr-5"
          aria-label="Gym owner testimonials"
        >
          {TESTIMONIALS.map(item => (
            <TestimonialCard key={item.author} item={item} />
          ))}
        </ul>
        {/* Second, identical copy for the seamless loop. Hidden from assistive tech so
            the quotes are not announced twice. */}
        <ul
          className="animate-marquee flex shrink-0 items-stretch gap-4 pr-4 md:gap-5 md:pr-5"
          aria-hidden
        >
          {TESTIMONIALS.map(item => (
            <TestimonialCard key={`dup-${item.author}`} item={item} />
          ))}
        </ul>
      </div>
    </section>
  );
}
