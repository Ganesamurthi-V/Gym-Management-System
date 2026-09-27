import { Star, Quote } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

/*
  Redesigned from a single-quote carousel to a card grid.

  The old design showed one testimonial at a time behind avatar tabs, so a visitor
  had to click each owner to discover what they said — and most never do. Social
  proof works by weight of numbers, so hiding two of three quotes behind an
  interaction worked against the section's whole purpose. All three are now visible
  at once: more scannable, more trustworthy, and nothing to operate.

  Each card also leads with a short, bolded takeaway pulled from the quote, so the
  grid is skimmable in a glance before anyone reads a full sentence.
*/
const TESTIMONIALS = [
  {
    highlight: 'From 4 notebooks to 1 tab',
    quote:
      'Before GymFlow I had 4 notebooks. Now I open one tab. Dues used to slip through — not anymore.',
    author: 'Karthik R.',
    role: 'Owner',
    gym: 'Iron Arena',
    initials: 'KR',
  },
  {
    highlight: 'Saves 2 hours every week',
    quote:
      'The WhatsApp reminder feature alone saves me 2 hours every week. Members actually pay on time now.',
    author: 'Priya S.',
    role: 'Owner',
    gym: 'FitZone',
    initials: 'PS',
  },
  {
    highlight: '300 members imported in 10 min',
    quote:
      'Imported 300 members from Excel in 10 minutes. It matched my columns straight away and let me check everything before saving.',
    author: 'Murugan T.',
    role: 'Owner',
    gym: 'Strength Lab',
    initials: 'MT',
  },
] as const;

export function Testimonials() {
  const scope = useReveal<HTMLElement>({ stagger: 0.1 });

  return (
    <section
      id="testimonials"
      ref={scope}
      aria-labelledby="testimonials-title"
      className="relative overflow-hidden border-y border-border-subtle bg-muted px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1100px]">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-[720px] text-center">
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

        {/* ── Card grid ───────────────────────────────────────────────────── */}
        {/* One column on phones, three from md up. Every quote is visible at once —
            no tabs, no carousel, nothing to click to see the rest. */}
        <ul className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
          {TESTIMONIALS.map(item => (
            <li
              key={item.author}
              className="reveal card card-hover flex flex-col p-6 text-left md:p-7"
            >
              {/* A faint quote mark anchors the card as a testimonial at a glance. */}
              <Quote className="h-7 w-7 shrink-0 text-accent/25" aria-hidden />

              <p className="mt-4 text-[15px] font-semibold leading-snug text-foreground">
                {item.highlight}
              </p>

              <blockquote className="mt-2.5 flex-1 text-[14px] leading-relaxed text-muted-foreground">
                &ldquo;{item.quote}&rdquo;
              </blockquote>

              {/* Attribution row: avatar + name/gym, and the per-card 5-star rating. */}
              <div className="mt-6 flex items-center gap-3 border-t border-border-subtle pt-5">
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent font-mono text-[12px] font-medium text-accent-ink"
                >
                  {item.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-foreground">
                    {item.author}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {item.role} @ {item.gym}
                  </span>
                </span>
                <span
                  className="flex items-center gap-0.5"
                  role="img"
                  aria-label={`${item.author} rated 5 out of 5`}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className="h-3 w-3 fill-accent text-accent" />
                  ))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
