import { Layout } from './components/Layout';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { InteractiveDemo } from './components/InteractiveDemo';
import { MobileSection } from './components/MobileSection';
import { Pricing } from './components/Pricing';
import { Testimonials } from './components/Testimonials';
import { Footer } from './components/Footer';

function App() {
  return (
    <Layout>
      <Navbar />
      <Hero />
      <Features />
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
