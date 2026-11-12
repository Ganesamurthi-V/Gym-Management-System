import { Dumbbell } from 'lucide-react';

export const GYM_NAME = 'Fit Zone Gym';

export function initials(name: string) {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ViewTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="shrink-0">
      <div className="mb-0.5 flex items-center gap-1.5">
        <Dumbbell className="h-3.5 w-3.5 text-dash-accent-text" />
        <span className="text-[10.5px] font-medium text-dash-ink-muted">{GYM_NAME}</span>
      </div>
      {/* p, not h3. This is chrome inside a decorative product preview, so it has
          no place in the page's heading outline: as an h3 directly after the
          hero's h1 it created a 1 -> 3 level jump. Tailwind Preflight resets
          margins on both elements, so nothing moves visually. */}
      <p className="text-[19px] font-bold tracking-tight text-dash-ink">{title}</p>
      {sub && <p className="mt-0.5 text-[11px] text-dash-ink-muted">{sub}</p>}
    </div>
  );
}

export function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      // The drop shadow is dropped in dark: a dark shadow on a near-black surface does
      // nothing but muddy the lower edge, and the border already separates the panel.
      className={`rounded-xl border border-dash-border bg-dash-surface shadow-dash-card dark:shadow-none ${className}`}
    >
      {children}
    </div>
  );
}
