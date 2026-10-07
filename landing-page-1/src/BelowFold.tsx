import { useEffect } from 'react';
import { BentoFeatures } from './components/BentoFeatures';
import { WhatsAppSection } from './components/WhatsAppSection';
import { HowItWorks } from './components/HowItWorks';
import { Testimonials } from './components/Testimonials';
import { Pricing } from './components/Pricing';
import { FAQ } from './components/FAQ';
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
export function BelowFoldSections() {
  usePauseOffscreenAnimations();
  return (
    <>
      <BentoFeatures />
      <WhatsAppSection />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
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
function usePauseOffscreenAnimations() {
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
  }, []);
}
