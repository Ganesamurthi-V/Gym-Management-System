// @ts-nocheck
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
    let ticking = false;
    const handleScroll = () => {
      // rAF-throttled + passive: never blocks the scroll thread
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 24);
        ticking = false;
      });
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <nav
      style={{
        background: scrolled
          ? 'rgba(255,255,255,0.88)'
          : 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: scrolled
          ? '1px solid rgba(37,99,235,0.12)'
          : '1px solid rgba(37,99,235,0.07)',
        boxShadow: scrolled
          ? '0 4px 24px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)'
          : 'none',
        // Promote to its own compositor layer so the 20px backdrop blur isn't
        // re-rasterized with the page on every scroll frame
        transform: 'translateZ(0)',
        willChange: 'backdrop-filter',
        transition: 'background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
      }}
      className="fixed top-0 left-0 right-0 z-50 h-[68px] flex items-center justify-between px-6 md:px-20"
    >
      {/* Logo */}
      <a href="#" className="flex items-center" aria-label="GymFlow home">
        <img src="/logo_landspace_without_bg.webp" alt="GymFlow" width="400" height="178" className="h-18 w-auto" />
      </a>

      {/* Desktop nav */}
      <div className="hidden md:flex items-center gap-1">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="relative px-4 py-2 text-[13.5px] font-medium text-slate-500 hover:text-slate-900 transition-colors rounded-lg hover:bg-slate-50 group"
          >
            {link.label}
            <span
              className="absolute bottom-1 left-4 right-4 h-[1.5px] rounded-full bg-blue-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-250 origin-left"
            />
          </a>
        ))}
      </div>

      {/* CTA + hamburger */}
      <div className="flex items-center gap-3">
        <a
          href="https://app.gymflow.sbs"
          className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-white rounded-xl py-2.5 px-5 transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #3B82F6 100%)',
            boxShadow: '0 4px 14px rgba(30,58,138,0.38), 0 1px 3px rgba(30,58,138,0.15), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
            (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 24px rgba(30,58,138,0.48), 0 2px 6px rgba(30,58,138,0.2), inset 0 1px 0 rgba(255,255,255,0.15)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 14px rgba(30,58,138,0.38), 0 1px 3px rgba(30,58,138,0.15), inset 0 1px 0 rgba(255,255,255,0.15)';
          }}
        >
          Get Started
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>

        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile panel */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-x-0 top-[68px] bottom-0 flex flex-col px-6 py-8 gap-1 animate-[fadeIn_0.2s_ease-out]"
          style={{
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(37,99,235,0.10)',
          }}
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="py-4 px-2 text-[17px] font-semibold text-slate-800 border-b border-slate-100/80 hover:text-blue-600 transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="https://app.gymflow.sbs"
            onClick={() => setMenuOpen(false)}
            className="mt-6 text-center text-white rounded-xl py-4 text-base font-bold"
            style={{
              background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #3B82F6 100%)',
              boxShadow: '0 8px 24px rgba(30,58,138,0.4)',
            }}
          >
            Get Started — Free Trial
          </a>
        </div>
      )}
    </nav>
  );
}
