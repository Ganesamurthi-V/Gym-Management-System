import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Magnet } from './fx';
import { useMediaQuery } from '../lib/useMediaQuery';
import { homeAnchor, isFeaturePage } from '../lib/pageAnchors';
import '../styles/nav.css';

const APP_URL = 'https://app.gymflow.sbs';

/* A short flat list, used by the desktop bar
   and the mobile sheet alike. The old Product and Resources dropdowns repeated the same
   few anchors (five entries all pointed at #features), so a visitor got more menu and no
   more places to go. */
const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#whatsapp', label: 'WhatsApp' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const;

/**
 * Where the inline menu takes over from the hamburger. Kept as a constant because the
 * sheet's open state is derived from it as well as hidden by the matching `lg:` classes,
 * and the two must not disagree.
 */
const DESKTOP_AT = 1024;

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);

  // Features has a page of its own, so it opens /features from the homepage and from every
  // feature page alike (it stays lit on feature pages, the way a section link lights up on the
  // homepage). WhatsApp, Pricing and FAQ are sections of the homepage: on a feature page there
  // is nothing to scroll to, so they leave for the homepage section ("/#pricing").
  const onFeaturePage = isFeaturePage();
  const links = NAV_LINKS.map(link => ({
    ...link,
    href: link.href === '#features' ? '/features' : homeAnchor(link.href),
    current: onFeaturePage ? link.href === '#features' : section === link.href.slice(1),
  }));

  const isDesktop = useMediaQuery(`(min-width: ${DESKTOP_AT}px)`);

  /*
    Derived rather than stored, and that matters for more than tidiness.

    The sheet is hidden by CSS at lg, but hiding it does not unset mobileOpen, and the
    scroll lock below was keyed to that: widening a phone-width window past lg with the
    sheet open left the page unscrollable with nothing on screen to release it.

    Deriving fixes that without an effect that resets state, which would only trade the
    stuck lock for a cascading render. The toggle below flips against this value rather
    than against mobileOpen, so returning to a narrow width cannot leave the button one
    press out of step with what is on screen.
  */
  const sheetOpen = mobileOpen && !isDesktop;

  // Which section is across the middle of the screen. One observer on the sections the
  // nav points at; a thin band at the vertical centre means exactly one is "current".
  useEffect(() => {
    // Feature pages have none of these sections, so there is nothing to watch.
    if (onFeaturePage) return;
    const ids = NAV_LINKS.map(link => link.href.slice(1));
    const els = ids.map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) if (e.isIntersecting) setSection(e.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [onFeaturePage]);

  // Escape closes the sheet: a full-screen overlay that ignores the key is surprising.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen]);

  // Lock body scroll behind the mobile sheet so the page underneath doesn't move.
  // Keyed to the derived value, so the lock is released whenever the sheet stops being
  // on screen, including because the viewport grew rather than because it was dismissed.
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  return (
    // A slim bar on the page colour with a 1px hairline (.nav-island). 64px tall, fixed; the mobile
    // sheet starts under it (top-16).
    <header className="fixed inset-x-0 top-0 z-50">
      <nav aria-label="Main" className="nav-island nav-bar relative">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-2 px-5 md:gap-6 md:px-8">
          {/* Logo */}
          <a href={homeAnchor('#')} aria-label="GymFlow home" className="flex min-h-[44px] shrink-0 items-center">
            <img
              src="/logo_landspace_without_bg.webp"
              alt="GymFlow"
              width={400}
              height={178}
              /* The wordmark is dark-inked: it reads as is on the light bar, and night lifts it to white.
                 48px on a phone, 56px from md up. */
              className="h-12 w-auto md:h-14 dark:brightness-0 dark:invert"
            />
          </a>

          {/* Desktop nav, centred on the bar. Out of flow it holds the true centre at every
              width, and the logo and CTAs still sit at the extremes. */}
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex">
            {links.map(link => (
              <a
                key={link.label}
                href={link.href}
                aria-current={link.current ? (onFeaturePage ? 'page' : 'location') : undefined}
                className="nav-link"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1 md:gap-2">
            <ThemeToggle />
            <a href={APP_URL} className="nav-link hidden xl:inline-flex">
              Sign in
            </a>
            {/* .btn-nav is the compact 44px keycap; Magnet pulls it a little toward a fine
                pointer and rests on touch and under reduced motion. */}
            <Magnet className="hidden sm:block" strength={0.12}>
              <a href={APP_URL} className="btn btn-primary btn-nav">
                Start free trial
              </a>
            </Magnet>

            {/* 44px so the menu button meets the touch-target minimum. */}
            <button
              type="button"
              onClick={() => setMobileOpen(!sheetOpen)}
              aria-label={sheetOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={sheetOpen}
              aria-controls={sheetOpen ? 'nav-mobile-sheet' : undefined}
              className="nav-iconbtn nav-menu-btn"
            >
              {sheetOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile sheet: a full-width panel under the bar with large links. */}
      {sheetOpen && (
        <div
          id="nav-mobile-sheet"
          className="nav-sheet fixed inset-x-0 bottom-0 top-16 overflow-y-auto px-5 py-6 lg:hidden"
          onClick={event => {
            // Any link tap closes the sheet; the delegated Lenis handler in
            // main.tsx still performs the scroll.
            if ((event.target as Element).closest('a')) setMobileOpen(false);
          }}
        >
          <ul className="flex flex-col border-t border-border-subtle">
            {links.map(link => (
              <li key={link.label}>
                <a href={link.href} className="nav-sheet-link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-4">
            <a href={APP_URL} className="btn btn-primary btn-lg w-full">
              Start free trial
            </a>
            <a href={APP_URL} className="btn btn-outline btn-lg w-full">
              Sign in
            </a>
          </div>
          <p className="mt-5 flex flex-wrap gap-x-6 text-base text-muted-foreground">
            <span>14-day free trial</span>
            <span>No credit card required</span>
          </p>
        </div>
      )}
    </header>
  );
}
