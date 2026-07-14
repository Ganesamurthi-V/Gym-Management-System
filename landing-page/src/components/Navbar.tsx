import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How It Works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#support', label: 'Support' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 h-[68px] flex items-center justify-between px-6 md:px-20 bg-white/90 backdrop-blur-md border-b border-blue-mid/15 transition-shadow duration-300 ${
        scrolled ? 'shadow-lg shadow-blue-dark/10' : ''
      }`}
    >
      <a href="#" className="flex items-center text-none" aria-label="GymFlow home">
        <img src="/logo_landspace_without_bg.png" alt="GymFlow" className="h-18 w-auto" />
      </a>

      <div className="hidden md:flex items-center gap-9">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-ink-mid hover:text-blue-mid transition-colors"
          >
            {link.label}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <a
          href="https://app.gymflow.sbs"
          className="hidden sm:inline-block bg-gradient-to-br from-blue-dark to-blue-bright text-white border-none rounded-lg py-2.5 px-5 text-sm font-semibold cursor-pointer text-none shadow-md shadow-blue-dark/25 transition-transform hover:-translate-y-px hover:shadow-lg hover:shadow-blue-dark/35"
        >
          Get Started
        </a>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg text-ink hover:bg-blue-mid/10 transition-colors"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[68px] bottom-0 bg-white/98 backdrop-blur-md border-t border-blue-mid/15 flex flex-col px-6 py-6 gap-1 animate-[fadeIn_0.15s_ease-out]">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="py-3.5 text-base font-medium text-ink border-b border-blue-mid/10 hover:text-blue-mid transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="https://app.gymflow.sbs"
            onClick={() => setMenuOpen(false)}
            className="mt-4 text-center bg-gradient-to-br from-blue-dark to-blue-bright text-white rounded-lg py-3.5 text-base font-semibold shadow-md shadow-blue-dark/25"
          >
            Get Started
          </a>
        </div>
      )}
    </nav>
  );
}
