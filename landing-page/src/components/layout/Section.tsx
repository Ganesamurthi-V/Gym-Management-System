import type { ReactNode } from 'react';

/*
  The layout system every section on every page uses (DESIGN.md, "Layout system"). A section picks a
  tone and one of two layouts; nothing else decides spacing, width or background.

  Write each H2 inline in the section's own file (`<h2 id="x-title" className="display-2 text-balance">`):
  scripts/check-copy-sync.mjs reads it from there.
*/

type Tone = 'chalk' | 'paper' | 'ink';

const TONE: Record<Tone, string> = {
  chalk: '',
  paper: 'border-y border-border-subtle bg-frame',
  ink: 'band-ink',
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
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative scroll-mt-24 overflow-hidden px-5 py-24 md:px-8 md:py-32 ${TONE[tone]} ${className}`}
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
          <h3 className="text-[20px] font-bold leading-snug text-foreground md:text-[22px]">{item.title}</h3>
          <p className="mt-2 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">{item.text}</p>
        </li>
      ))}
    </ul>
  );
}
