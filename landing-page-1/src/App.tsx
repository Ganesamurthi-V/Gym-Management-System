import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Statement } from './components/Statement';
import { BentoFeatures } from './components/BentoFeatures';
import { WhatsAppSection } from './components/WhatsAppSection';
import { HowItWorks } from './components/HowItWorks';
import { Testimonials } from './components/Testimonials';
import { Pricing } from './components/Pricing';
import { FAQ } from './components/FAQ';
import { CTA } from './components/CTA';
import { Footer } from './components/Footer';

function App() {
  // Infinite CSS animations (marquee, float, pulsing dots) keep compositing even
  // when their section is scrolled past, which shows up as scroll jank for no
  // visual benefit. Pause them while offscreen; .gf-anim-paused does the work.
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

    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <Layout>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Statement />
        <BentoFeatures />
        <WhatsAppSection />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </Layout>
  );
}

export default App;
