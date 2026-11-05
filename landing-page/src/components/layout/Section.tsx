import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/*
  The layout system every section on every page uses (DESIGN.md, "Layout system"). A section picks a
  tone and one of two layouts; nothing else decides spacing, width or background.

  Write each H2 inline in the section's own file (`<h2 id="x-title" className="display-2 text-balance">`):
  scripts/check-copy-sync.mjs reads it from there.
*/

type Tone = 'chalk' | 'paper' | 'tint' | 'ink' | 'accent';
type Cut = 'top' | 'bottom' | 'both';

/*
  Tones: chalk = the page colour, paper = the second band (--subtle), ink = the one graphite band,
  tint = a pale blue wash of the brand colour, accent = the Royal Blue band. `cut` is accepted for old call sites and ignored: the diagonal cuts are gone.
*/
const TONE: Record<Tone, string> = {
  chalk: '',
  paper: 'bg-subtle',
  tint: 'band-tint',
  ink: 'band-ink',
  accent: 'band-accent',
};

/** Section shell: tone, standard padding and the 1200px column. */
export function Section({
  id,
  labelledBy,
  tone = 'chalk',
  className = '',
  children,
}: {
  id?: string;
  labelledBy: string;
  tone?: Tone;
  /** Ignored. Kept so existing call sites compile. */
  cut?: Cut;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative scroll-mt-24 overflow-clip px-4 py-24 sm:px-6 md:py-32 lg:px-8 lg:py-40 min-[1920px]:px-16 ${TONE[tone]} ${className}`}
    >
      <div className="mx-auto max-w-[1200px]">{children}</div>
    </section>
  );
}

/** Heading block: the H2 (passed in, written inline), an optional lead and optional actions. */
export function SectionHead({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-[560px]">
      {title}
      {lead && <p className="lead mt-5">{lead}</p>}
      {children && <div className="mt-7">{children}</div>}
    </div>
  );
}

/**
 * The hero's own heading rhythm, reused below it (DESIGN.md, "Section kit"): the H2 centred, one
 * centred lead under it, optional actions. Every home section after the hero opens with this, so the
 * page reads as one piece; the body under it is what changes from section to section.
 */
export function CenterHead({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[760px] text-center">
      {title}
      {lead && <p className="lead mx-auto mt-5 max-w-[60ch] text-balance">{lead}</p>}
      {children && <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

/** The one fact list: a blue check and one short sentence per line. */
export function CheckList({ items, className = '' }: { items: readonly ReactNode[]; className?: string }) {
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-muted-foreground">
          <Check aria-hidden className="mt-[3px] size-4 shrink-0 text-accent-text" strokeWidth={2.5} />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Layout 1, "split": the heading on the left (sticky on wide screens), the content on the right.
 * For lists, steps, questions and a single product screen beside its explanation.
 */
export function Split({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-28">{head}</div>
      </div>
      <div className="min-w-0 lg:col-span-7">{children}</div>
    </div>
  );
}

/**
 * Layout 2, "showcase": the heading on top, then wide content (a full product screen, plan panels).
 */
export function Showcase({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div>
      {head}
      <div className="mt-12 md:mt-16">{children}</div>
    </div>
  );
}

/** The one list style: ruled rows, a short bold title and one sentence. */
export function RuledList({ items }: { items: readonly { title: string; text: ReactNode }[] }) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.title} className="border-t border-border-subtle py-7 last:border-b md:py-8">
          <h3 className="font-display text-[20px] font-medium leading-snug tracking-[-0.02em] text-foreground md:text-[22px]">{item.title}</h3>
          <p className="mt-2 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">{item.text}</p>
        </li>
      ))}
    </ul>
  );
}
