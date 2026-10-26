import { useEffect, useState } from 'react';
import { Purpose } from './components/Purpose';
import { Problems } from './components/Problems';
import { Benefits } from './components/Benefits';
import { BentoFeatures } from './components/BentoFeatures';
import { WhatsAppSection } from './components/WhatsAppSection';
import { HowItWorks } from './components/HowItWorks';
import { Pricing } from './components/Pricing';
import { FAQ } from './components/FAQ';
import { Founder } from './components/Founder';
import { CTA } from './components/CTA';
import { Footer } from './components/Footer';

/**
 * Everything under the hero, in one lazily loaded chunk (see App.tsx).
 *
 * Kept as its own module so the browser's first download is only what the opening screen
 * needs. These sections pull in the animation-heavy code (the pricing counter, the scroll
 * rails, the orbit), which is about half of the original startup script and none of it
 * visible before the visitor scrolls.
 */
const SECTIONS = [
  { key: 'why', Section: Purpose },
  { key: 'problems', Section: Problems },
  { key: 'benefits', Section: Benefits },
  { key: 'features', Section: BentoFeatures },
  { key: 'whatsapp', Section: WhatsAppSection },
  { key: 'how', Section: HowItWorks },
  { key: 'pricing', Section: Pricing },
  { key: 'faq', Section: FAQ },
  { key: 'founder', Section: Founder },
  { key: 'cta', Section: CTA },
] as const;

/**
 * Mounts the sections one per idle slot instead of all in one task.
 *
 * Mounting all eight together was a single main-thread task of 382ms under a 4x CPU throttle
 * (React render, layout of the whole page, and every section's ScrollTrigger and measuring
 * effects), which is most of the page's blocking time and what an INP-style interaction right
 * after load would queue behind. One section at a time keeps each task near the budget. Sections
 * are appended in page order, so nothing already on screen moves. A link that carries a #section
 * mounts everything at once so the target exists when App scrolls to it.
 */
function useStagedCount(total: number, onDone: () => void): number {
  const [shown, setShown] = useState(() => (window.location.hash ? total : 1));

  useEffect(() => {
    if (shown >= total) {
      onDone();
      return;
    }
    const next = () => setShown(n => n + 1);
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(next, { timeout: 150 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(next, 50);
    return () => window.clearTimeout(handle);
  }, [shown, total, onDone]);

  return shown;
}

export function BelowFoldSections({ onDone }: { onDone: () => void }) {
  const shown = useStagedCount(SECTIONS.length, onDone);
  usePauseOffscreenAnimations(shown);
  return (
    <>
      {SECTIONS.slice(0, shown).map(({ key, Section }) => (
        <Section key={key} />
      ))}
    </>
  );
}

export function BelowFoldFooter() {
  usePauseOffscreenAnimations();
  return <Footer />;
}

/**
 * Infinite CSS animations (marquee, float, pulsing dots) keep compositing even when their
 * section is scrolled past, which shows up as scroll jank for no visual benefit. Pause them
 * while offscreen; .gf-anim-paused does the work. Runs again here because these sections
 * mount after App's own pass.
 */
function usePauseOffscreenAnimations(sectionCount = 0) {
  useEffect(() => {
    const sections = document.querySelectorAll('section, footer');
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          entry.target.classList.toggle('gf-anim-paused', !entry.isIntersecting);
        }
      },
      { rootMargin: '100px 0px' },
    );
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
    // Re-run as sections are appended: the query below only sees what is mounted at the time.
  }, [sectionCount]);
}
