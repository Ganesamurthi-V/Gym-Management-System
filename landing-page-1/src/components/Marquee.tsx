import type { ReactNode } from 'react';

interface MarqueeProps {
  items: readonly string[];
  /** Seconds for one full pass. Longer list, longer duration, so speed stays even. */
  durationSeconds?: number;
  /** Rendered between items. */
  separator?: ReactNode;
}

/**
 * Edge-faded infinite marquee.
 *
 * The track holds the list twice and travels exactly -50%, so the loop point
 * lands on a frame identical to the start and the seam is invisible. The second
 * copy is aria-hidden — it is the same content, and a screen reader announcing
 * every city twice is noise.
 */
export function Marquee({ items, durationSeconds = 42, separator }: MarqueeProps) {
  const renderItems = (hidden: boolean) => (
    <ul
      className="flex shrink-0 items-center gap-10 pr-10"
      aria-hidden={hidden || undefined}
    >
      {items.map(item => (
        <li key={item} className="flex shrink-0 items-center gap-10">
          <span className="whitespace-nowrap font-mono text-[13px] tracking-wide text-muted-foreground">
            {item}
          </span>
          {separator ?? <span className="h-1 w-1 shrink-0 rounded-full bg-border-strong" />}
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className="marquee-track relative overflow-hidden"
      style={{
        // Fade both edges instead of hard-clipping, so items enter and leave
        // rather than popping at the boundary.
        maskImage:
          'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
        WebkitMaskImage:
          'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
      }}
    >
      <div
        className="animate-marquee flex w-max"
        style={{ ['--marquee-duration' as string]: `${durationSeconds}s` }}
      >
        {renderItems(false)}
        {renderItems(true)}
      </div>
    </div>
  );
}
