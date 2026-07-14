import { useState, useEffect } from 'react';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 h-[68px] flex items-center justify-between px-6 md:px-20 transition-shadow duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-md border-b border-blue-mid/15 shadow-lg shadow-blue-dark/10'
          : 'bg-white/90 backdrop-blur-md border-b border-blue-mid/15'
      }`}
    >
      <a href="#" className="flex items-center text-none">
        <img src="/logo_landspace_without_bg.png" alt="GymFlow Logo" className="h-18 w-auto" />
      </a>

      <div className="hidden md:flex items-center gap-9">
        <a href="#features" className="text-sm font-medium text-ink-mid hover:text-blue-mid transition-colors">
          Features
        </a>
        <a href="#how" className="text-sm font-medium text-ink-mid hover:text-blue-mid transition-colors">
          How It Works
        </a>
        <a href="#pricing" className="text-sm font-medium text-ink-mid hover:text-blue-mid transition-colors">
          Pricing
        </a>
        <a href="#support" className="text-sm font-medium text-ink-mid hover:text-blue-mid transition-colors">
          Support
        </a>
      </div>

      <a
        href="#"
        className="bg-gradient-to-br from-blue-dark to-blue-bright text-white border-none rounded-lg py-2.5 px-5 text-sm font-semibold cursor-pointer text-none shadow-md shadow-blue-dark/25 transition-transform hover:-translate-y-px hover:shadow-lg hover:shadow-blue-dark/35"
      >
        Get Started
      </a>
    </nav>
  );
}
