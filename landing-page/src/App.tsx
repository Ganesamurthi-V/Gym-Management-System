// @ts-nocheck
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { InteractiveDemo } from './components/InteractiveDemo';
import { MobileSection } from './components/MobileSection';
import { WhatsAppSection } from './components/WhatsAppSection';
import { Pricing } from './components/Pricing';
import { Testimonials } from './components/Testimonials';
import { Footer } from './components/Footer';

function App() {
  // Pause infinite CSS animations (orbs, shimmer, float) while their section is
  // offscreen — they're invisible anyway, and letting them run forces constant
  // compositing work that janks scrolling. Zero visual change.
  useEffect(() => {
    const sections = document.querySelectorAll('section, footer');
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          entry.target.classList.toggle('gf-anim-paused', !entry.isIntersecting);
        }
      },
      { rootMargin: '100px 0px' }
    );
    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <Layout>
      <Navbar />
      <Hero />
      <Features />
      <WhatsAppSection />
      <HowItWorks />
      <InteractiveDemo />
      <MobileSection />
      <Pricing />
      <Testimonials />
      <Footer />
    </Layout>
  );
}

export default App;
