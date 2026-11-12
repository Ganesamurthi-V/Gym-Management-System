import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import '../../styles/home.css';

/*
  The layout system every home section uses (DESIGN.md, "Taste redesign"). A section picks a ground and
  fills the one wrap; spacing, width and heading scale live in styles/home.css, nothing else decides them.

  Write each H2 inline in the section's own file (`<h2 id="x-title" className="h2">`):
  scripts/check-copy-sync.mjs reads it from there.
*/

/** chalk = the page colour, paper = the second band, ink = the one graphite band, accent = the Royal Blue close. */
type Tone = 'chalk' | 'paper' | 'ink' | 'accent';

const TONE: Record<Tone, string> = {
  chalk: '',
  paper: 'sec--alt',
  ink: 'band-ink',
  accent: 'band-accent',
};

/** Section shell: ground, standard padding and the 1200px wrap. The heading is its first child. */
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
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`sec ${TONE[tone]} ${className}`}>
      <div className="wrap">{children}</div>
    </section>
  );
}

/** Heading block, left aligned on the wrap line: the H2 (passed in, written inline), one lead line, optional actions. */
export function SectionHead({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sec-head">
      {title}
      {lead && <p className="lead">{lead}</p>}
      {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

/** The one fact list: a blue check and one short sentence per line. */
export function CheckList({ items, className = '' }: { items: readonly ReactNode[]; className?: string }) {
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[16px] leading-relaxed text-muted-foreground">
          <Check aria-hidden className="mt-[4px] size-4 shrink-0 text-accent-text" strokeWidth={2.5} />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Layout 1, "split": the heading on the left (sticky on wide screens), the content on the right.
 * Used by the feature pages.
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
