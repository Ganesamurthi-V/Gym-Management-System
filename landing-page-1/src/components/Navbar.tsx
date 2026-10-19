import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { useMediaQuery } from '../lib/useMediaQuery';

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
 * Floating-island metrics, in px.
 *
 * These live as constants rather than Tailwind classes because the mobile
 * sheet's top offset is derived from them. The sheet used to be pinned at a
 * hardcoded top-[68px], which silently became wrong the moment the bar started
 * changing height — it would have overlapped the bar or floated below it.
 *
 * NAV_H_SCROLLED is only 10px shorter on purpose. The reference this mirrors
 * keeps its height fixed and gets the "shrunk" read entirely from narrowing the
 * width; a large height change on a fixed element reads as a jolt rather than a
 * settle, because every item inside it moves vertically at the same time.
 */
const NAV_TOP = 14;
const NAV_H = 76;
const NAV_H_SCROLLED = 64;
const NAV_MAX_W = 1240;
const NAV_MAX_W_SCROLLED = 1120;

/**
 * Scroll distance before the bar collapses. Matched to the reference, which
 * flips between 40px and 60px, and deliberately past the old 16px: at 16 the bar
 * changed shape while the visitor was still effectively looking at the top of
 * the hero, which read as a twitch rather than a response to scrolling.
 */
const COLLAPSE_AT = 48;

/**
 * Where the inline menu takes over from the hamburger. Kept as a constant because the
 * sheet's open state is derived from it as well as hidden by the matching `lg:` classes,
 * and the two must not disagree.
 */
const DESKTOP_AT = 1024;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);

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
  }, []);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      // rAF-throttled and passive so the handler never blocks the scroll thread.
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > COLLAPSE_AT);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    // Two layers, mirroring the reference: the <header> is a transparent,
    // full-width padded frame that never moves, and the <nav> inside it is the
    // island that collapses. Animating a fixed, full-bleed bar directly would
    // mean animating the thing the dropdowns are positioned against.
    <header className="fixed inset-x-0 top-0 z-50 px-3 md:px-5" style={{ paddingTop: NAV_TOP }}>
      <nav
        aria-label="Main"
        className="nav-island relative mx-auto flex items-center justify-between gap-6 px-4 md:px-6"
        style={{
          height: scrolled ? NAV_H_SCROLLED : NAV_H,
          maxWidth: scrolled ? NAV_MAX_W_SCROLLED : NAV_MAX_W,
          borderRadius: 16,
          // Transparent at rest so the hero mesh reads through it cleanly, and a
          // translucent --frame surface once collapsed. --frame rather than
          // --background because the island is meant to sit above the page, not
          // blend into it.
          backgroundColor: scrolled
            ? 'color-mix(in srgb, var(--frame) 72%, transparent)'
            : 'transparent',
          // Toggled rather than transitioned. backdrop-filter does not
          // interpolate cheaply, and the reference snaps it too — the 400ms
          // colour fade running alongside hides the switch.
          backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
          border: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
          boxShadow: scrolled
            ? '0 10px 34px -12px color-mix(in srgb, var(--foreground) 22%, transparent)'
            : 'none',
          // Own compositor layer, so the blur is not re-rasterised with the page
          // on every scroll frame.
          transform: 'translateZ(0)',
        }}
      >
        {/* Logo */}
        <a href="#" aria-label="GymFlow home" className="flex shrink-0 items-center">
          <img
            src="/logo_landspace_without_bg.webp"
            alt="GymFlow"
            width={400}
            height={178}
            /* The wordmark is dark-inked, so on the dark navbar it was all but
               invisible. brightness-0 crushes it to black and invert lifts it to
               white — the same treatment the footer logo uses on its blue panel.

               Responsive: h-9 (36px) on mobile, h-14 (56px) from md up. The
               island is 76px (64px collapsed), so 56px keeps ~4px clearance top
               and bottom when scrolled — a single fixed large height filled the
               whole bar on phones. */
            className="h-9 w-auto dark:brightness-0 dark:invert md:h-14"
          />
        </a>

        {/* Desktop nav, centred on the island rather than left as the middle child of a
            justify-between row. That only centres the middle child when the two either
            side of it match in width, and they do not: the wordmark measures 126px
            against a 235px right cluster, which put the menu 62px left of centre. Out of
            flow it holds the true centre at every width, and the logo and CTAs still sit
            at the extremes, which is what justify-between is actually good at. */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 lg:flex">
          {NAV_LINKS.map(link => {
            const current = section === link.href.slice(1);
            return (
              <a
                key={link.href}
                href={link.href}
                aria-current={current ? 'location' : undefined}
                className={`rounded-pill px-3 py-2 text-[13.5px] font-medium transition-colors ${
                  current ? 'bg-subtle text-foreground' : 'text-muted-foreground hover:bg-subtle hover:text-foreground'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={APP_URL}
            className="hidden rounded-pill px-3.5 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground xl:inline-flex"
          >
            Sign in
          </a>
          {/* Compact size via .btn-nav (see index.css): the base .btn (12px/22px,
              14px) reads oversized in the nav strip next to the ghost "Sign in"
              link. Tailwind px/py utilities lose the cascade to .btn's own
              padding, so the smaller size is a dedicated class authored after
              .btn. */}
          <a href={APP_URL} className="btn btn-primary btn-nav hidden sm:inline-flex">
            Start free trial
          </a>

          <button
            type="button"
            onClick={() => setMobileOpen(!sheetOpen)}
            aria-label={sheetOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={sheetOpen}
            aria-controls={sheetOpen ? 'nav-mobile-sheet' : undefined}
            className="grid h-9 w-9 place-items-center rounded-pill border border-border-subtle bg-frame text-foreground lg:hidden"
          >
            {sheetOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile sheet */}
      {sheetOpen && (
        <div
          id="nav-mobile-sheet"
          // Derived from the island metrics rather than hardcoded: the bar now
          // changes height, so a fixed offset would leave a gap or an overlap.
          style={{ top: NAV_TOP + (scrolled ? NAV_H_SCROLLED : NAV_H) }}
          className="animate-fade-in-up fixed inset-x-0 bottom-0 overflow-y-auto border-t border-border-subtle bg-background px-5 py-6 lg:hidden"
          onClick={event => {
            // Any link tap closes the sheet; the delegated Lenis handler in
            // main.tsx still performs the scroll.
            if ((event.target as Element).closest('a')) setMobileOpen(false);
          }}
        >
          <ul className="flex flex-col">
            {NAV_LINKS.map(link => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block border-b border-border-subtle py-4 text-[17px] font-medium text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-col gap-3">
            <a href={APP_URL} className="btn btn-primary btn-lg w-full">
              Start free trial <ArrowRight className="h-4 w-4" />
            </a>
            <a href={APP_URL} className="btn btn-outline btn-lg w-full">
              Sign in
            </a>
          </div>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            14-day free trial · No credit card required
          </p>
        </div>
      )}
    </header>
  );
}
