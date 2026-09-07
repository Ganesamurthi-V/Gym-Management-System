import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

const TESTIMONIALS = [
  {
    quote:
      'Before GymFlow I had 4 notebooks. Now I open one tab. Dues used to slip through — not anymore.',
    author: 'Karthik R.',
    role: 'Owner',
    gym: 'Iron Arena',
    initials: 'KR',
  },
  {
    quote:
      'The WhatsApp reminder feature alone saves me 2 hours every week. Members actually pay on time now.',
    author: 'Priya S.',
    role: 'Owner',
    gym: 'FitZone',
    initials: 'PS',
  },
  {
    quote:
      'Imported 300 members from Excel in 10 minutes. GymFlow fixed all the messy area names automatically.',
    author: 'Murugan T.',
    role: 'Owner',
    gym: 'Strength Lab',
    initials: 'MT',
  },
] as const;

export function Testimonials() {
  const scope = useReveal<HTMLElement>({ stagger: 0.1 });
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Arrow keys move between tabs, which is what the tablist pattern requires —
   * the tabs are in the tab order only once, so without this a keyboard user
   * could reach the list but never change the panel.
   */
  const onKeyDown = (event: ReactKeyboardEvent) => {
    const offset =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (offset === 0) return;

    event.preventDefault();
    const next = (active + offset + TESTIMONIALS.length) % TESTIMONIALS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const current = TESTIMONIALS[active];

  return (
    <section
      id="testimonials"
      ref={scope}
      aria-labelledby="testimonials-title"
      className="relative overflow-hidden border-y border-border-subtle bg-muted px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[900px] text-center">
        <span className="reveal eyebrow">What gym owners say</span>
        <h2 id="testimonials-title" className="reveal display-2 mt-4 text-balance">
          Real gyms. <span className="text-muted-foreground">Real results.</span>
        </h2>

        {/* ── Avatar tabs ─────────────────────────────────────────────────── */}
        <div
          role="tablist"
          aria-label="Gym owner testimonials"
          onKeyDown={onKeyDown}
          className="reveal mt-12 flex items-center justify-center gap-3"
        >
          {TESTIMONIALS.map((item, index) => {
            const selected = index === active;
            return (
              <button
                key={item.author}
                ref={element => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`testimonial-tab-${index}`}
                aria-selected={selected}
                aria-controls="testimonial-panel"
                // Only the selected tab is tabbable; arrow keys handle the rest.
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(index)}
                title={`${item.author} — ${item.gym}`}
                className={`grid place-items-center rounded-full font-mono text-[13px] font-medium transition-all duration-300 ${
                  selected
                    ? 'h-14 w-14 bg-accent text-accent-ink ring-2 ring-accent ring-offset-4 ring-offset-muted'
                    : 'h-12 w-12 bg-frame text-muted-foreground ring-1 ring-border-subtle hover:text-foreground hover:ring-border-strong'
                }`}
              >
                {item.initials}
                <span className="sr-only">
                  Show testimonial from {item.author}, {item.gym}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Panel ───────────────────────────────────────────────────────── */}
        <div
          id="testimonial-panel"
          role="tabpanel"
          aria-labelledby={`testimonial-tab-${active}`}
          className="reveal mt-10"
        >
          {/* Keying on the index remounts the block, so the fade replays on every
              tab change instead of only on first render. */}
          <div key={active} className="animate-fade-in-up">
            <div
              className="flex items-center justify-center gap-1"
              role="img"
              aria-label="Rated 5 out of 5"
            >
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="h-4 w-4 fill-accent text-accent" />
              ))}
            </div>

            <blockquote className="mx-auto mt-7 max-w-[720px] text-[clamp(20px,2.6vw,30px)] font-medium leading-[1.4] tracking-[-0.02em] text-foreground">
              &ldquo;{current.quote}&rdquo;
            </blockquote>

            <figcaption className="mt-8 text-sm">
              <span className="font-medium text-foreground">{current.author}</span>
              <span className="text-muted-foreground">
                {' '}
                — {current.role} @ {current.gym}
              </span>
            </figcaption>
          </div>
        </div>

        {/* Progress rail: which of the three you are on, without dots competing
            with the avatars above. */}
        <div className="reveal mx-auto mt-10 flex max-w-[180px] gap-1.5" aria-hidden>
          {TESTIMONIALS.map((item, index) => (
            <span
              key={item.author}
              className={`h-0.5 flex-1 rounded-pill transition-colors duration-300 ${
                index === active ? 'bg-accent' : 'bg-border-strong'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
