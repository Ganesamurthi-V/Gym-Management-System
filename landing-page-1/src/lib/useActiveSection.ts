import { useEffect, useState } from 'react';

/**
 * Tracks which section is currently under the header so the nav can mark it.
 *
 * PillNav's activeHref is written for a router, where the active route is known
 * outright. On a single page it has to be derived, otherwise the active dot
 * stays pinned to one item no matter where the visitor has scrolled to.
 *
 * The rootMargin crops the observer down to a band just below the fixed header:
 * a section counts as current once its top clears the header and while it still
 * occupies the upper third of the viewport. Lenis drives real scroll position
 * rather than a transform, so IntersectionObserver sees these crossings.
 */
export function useActiveSection(hrefs: readonly string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(undefined);

  useEffect(() => {
    const sections = hrefs
      .map(href => {
        const el = href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
        return el ? { href, el } : null;
      })
      .filter((entry): entry is { href: string; el: HTMLElement } => entry !== null);

    if (!sections.length) return;

    const visible = new Map<Element, number>();

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target, entry.intersectionRatio);
          else visible.delete(entry.target);
        }

        if (!visible.size) {
          // Above the first section (hero) or past the last — no item is current.
          setActive(undefined);
          return;
        }

        // Document order wins over ratio: while two sections straddle the band,
        // the one being scrolled into is the one the visitor is heading for.
        const current = sections.find(section => visible.has(section.el));
        setActive(current?.href);
      },
      { rootMargin: '-88px 0px -66% 0px', threshold: [0, 0.01, 0.25, 0.5] },
    );

    sections.forEach(section => observer.observe(section.el));
    return () => observer.disconnect();
  }, [hrefs]);

  return active;
}
