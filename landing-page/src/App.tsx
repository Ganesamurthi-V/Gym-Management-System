import { Layout } from './components/Layout';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { StatsStrip } from './components/StatsStrip';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { InteractiveDemo } from './components/InteractiveDemo';
import { Pricing } from './components/Pricing';
import { Testimonials } from './components/Testimonials';
import { Footer } from './components/Footer';

function App() {
  return (
    <Layout>
      <Navbar />
      <Hero />
      <StatsStrip />
      <Features />
      <HowItWorks />
      <InteractiveDemo />
      <Pricing />
      <Testimonials />
      <Footer />
    </Layout>
  );
}

export default App;
