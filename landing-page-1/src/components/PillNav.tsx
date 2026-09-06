import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../lib/useReveal';

/*
  PillNav — adapted from React Bits (MIT), https://reactbits.dev
  https://github.com/DavidHDev/react-bits

  The hover geometry (the circle that swells up out of each pill while the label
  slides away and a second copy rises into its place) is kept as published. The
  deviations from upstream are deliberate and each one is noted at its site:

    · react-router-dom removed — this is a single page with hash anchors, and
      upstream already routed hash/absolute hrefs to a plain <a>, so the Link
      branch was unreachable here anyway.
    · menubar/menuitem/none roles dropped — wrong ARIA for site navigation, and
      they promise arrow-key semantics the component does not implement.
    · logoHref is explicit instead of borrowing items[0].href under a hardcoded
      "Home" label.
    · position: fixed instead of absolute, so the nav stays reachable.
    · prefers-reduced-motion honoured for the entrance and the logo spin.
    · Escape, outside-press and link-tap all close the mobile sheet.
    · rightSlot added so the theme toggle and CTA share the bar.
*/

export type PillNavItem = {
  label: string;
  href: string;
  ariaLabel?: string;
};

export interface PillNavProps {
  logo: string;
  logoAlt?: string;
  logoHref?: string;
  items: PillNavItem[];
  activeHref?: string;
  className?: string;
  ease?: string;
  baseColor?: string;
  pillColor?: string;
  hoveredPillTextColor?: string;
  pillTextColor?: string;
  /** Rendered at the far end of the bar — theme toggle, CTA, and the like. */
  rightSlot?: ReactNode;
  /** Repeated inside the mobile sheet, which otherwise only lists links. */
  mobileSlot?: ReactNode;
  initialLoadAnimation?: boolean;
}

export function PillNav({
  logo,
  logoAlt = 'Logo',
  logoHref = '#',
  items,
  activeHref,
  className = '',
  ease = 'power3.easeOut',
  // Default to tokens rather than literals so the bar follows the .dark class.
  baseColor = 'var(--pill-nav-base)',
  pillColor = 'var(--pill-nav-pill)',
  hoveredPillTextColor = 'var(--pill-nav-hover-text)',
  pillTextColor = 'var(--pill-nav-pill-text)',
  rightSlot,
  mobileSlot,
  initialLoadAnimation = true,
}: PillNavProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const circleRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const tlRefs = useRef<Array<gsap.core.Timeline | null>>([]);
  const activeTweenRefs = useRef<Array<gsap.core.Tween | null>>([]);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const logoTweenRef = useRef<gsap.core.Tween | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const navItemsRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLAnchorElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reduced = prefersReducedMotion();

    // Measures each pill and builds its paused hover timeline. The circle is
    // sized so that, scaled up, it covers the whole pill from the bottom edge.
    const layout = () => {
      circleRefs.current.forEach(circle => {
        if (!circle?.parentElement) return;

        const pill = circle.parentElement as HTMLElement;
        const { width: w, height: h } = pill.getBoundingClientRect();
        if (!w || !h) return;

        const R = ((w * w) / 4 + h * h) / (2 * h);
        const D = Math.ceil(2 * R) + 2;
        const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
        const originY = D - delta;

        circle.style.width = `${D}px`;
        circle.style.height = `${D}px`;
        circle.style.bottom = `-${delta}px`;

        gsap.set(circle, {
          xPercent: -50,
          scale: 0,
          transformOrigin: `50% ${originY}px`,
        });

        const label = pill.querySelector<HTMLElement>('.pill-label');
        const hoverLabel = pill.querySelector<HTMLElement>('.pill-label-hover');

        if (label) gsap.set(label, { y: 0 });
        if (hoverLabel) gsap.set(hoverLabel, { y: h + 12, opacity: 0 });

        const index = circleRefs.current.indexOf(circle);
        if (index === -1) return;

        tlRefs.current[index]?.kill();
        const tl = gsap.timeline({ paused: true });

        tl.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease, overwrite: 'auto' }, 0);
        if (label) {
          tl.to(label, { y: -(h + 8), duration: 2, ease, overwrite: 'auto' }, 0);
        }
        if (hoverLabel) {
          gsap.set(hoverLabel, { y: Math.ceil(h + 100), opacity: 0 });
          tl.to(hoverLabel, { y: 0, opacity: 1, duration: 2, ease, overwrite: 'auto' }, 0);
        }

        tlRefs.current[index] = tl;
      });
    };

    layout();

    const onResize = () => layout();
    window.addEventListener('resize', onResize);
    // Labels shift once Geist swaps in, which would leave the circle geometry
    // measured against fallback metrics.
    if (document.fonts) document.fonts.ready.then(layout).catch(() => {});

    const menu = mobileMenuRef.current;
    if (menu) gsap.set(menu, { visibility: 'hidden', opacity: 0, y: 0 });

    if (initialLoadAnimation && !reduced) {
      if (logoRef.current) {
        gsap.set(logoRef.current, { scale: 0 });
        gsap.to(logoRef.current, { scale: 1, duration: 0.6, ease });
      }
      if (navItemsRef.current) {
        gsap.set(navItemsRef.current, { width: 0, overflow: 'hidden' });
        gsap.to(navItemsRef.current, { width: 'auto', duration: 0.6, ease });
      }
    }

    return () => {
      window.removeEventListener('resize', onResize);
      // Upstream leaves these running; without the kill, a remount stacks
      // timelines on detached nodes.
      tlRefs.current.forEach(tl => tl?.kill());
      activeTweenRefs.current.forEach(tween => tween?.kill());
      logoTweenRef.current?.kill();
      tlRefs.current = [];
      activeTweenRefs.current = [];
    };
  }, [items, ease, initialLoadAnimation]);

  // Escape and outside-press close the sheet; without them it stays open while
  // the visitor interacts with the page behind it.
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!shellRef.current?.contains(target)) closeMobileMenu();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileMenuOpen]);

  const handleEnter = (i: number) => {
    const tl = tlRefs.current[i];
    if (!tl) return;
    activeTweenRefs.current[i]?.kill();
    activeTweenRefs.current[i] = tl.tweenTo(tl.duration(), {
      duration: 0.3,
      ease,
      overwrite: 'auto',
    });
  };

  const handleLeave = (i: number) => {
    const tl = tlRefs.current[i];
    if (!tl) return;
    activeTweenRefs.current[i]?.kill();
    activeTweenRefs.current[i] = tl.tweenTo(0, { duration: 0.2, ease, overwrite: 'auto' });
  };

  const handleLogoEnter = () => {
    const img = logoImgRef.current;
    if (!img || prefersReducedMotion()) return;
    logoTweenRef.current?.kill();
    gsap.set(img, { rotate: 0 });
    logoTweenRef.current = gsap.to(img, { rotate: 360, duration: 0.4, ease, overwrite: 'auto' });
  };

  const animateHamburger = (open: boolean) => {
    const lines = hamburgerRef.current?.querySelectorAll('.hamburger-line');
    if (!lines?.length) return;
    const duration = prefersReducedMotion() ? 0 : 0.3;
    gsap.to(lines[0], { rotation: open ? 45 : 0, y: open ? 3 : 0, duration, ease });
    gsap.to(lines[1], { rotation: open ? -45 : 0, y: open ? -3 : 0, duration, ease });
  };

  const setMenu = (open: boolean) => {
    setIsMobileMenuOpen(open);
    animateHamburger(open);

    const menu = mobileMenuRef.current;
    if (!menu) return;
    const duration = prefersReducedMotion() ? 0 : open ? 0.3 : 0.2;

    if (open) {
      gsap.set(menu, { visibility: 'visible' });
      gsap.fromTo(
        menu,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration, ease, transformOrigin: 'top center' },
      );
    } else {
      gsap.to(menu, {
        opacity: 0,
        y: 10,
        duration,
        ease,
        transformOrigin: 'top center',
        onComplete: () => gsap.set(menu, { visibility: 'hidden' }),
      });
    }
  };

  const closeMobileMenu = () => setMenu(false);
  const toggleMobileMenu = () => setMenu(!isMobileMenuOpen);

  const cssVars = {
    '--base': baseColor,
    '--pill-bg': pillColor,
    '--hover-text': hoveredPillTextColor,
    '--pill-text': pillTextColor,
    '--nav-h': '42px',
    '--pill-pad-x': '18px',
    '--pill-gap': '3px',
  } as CSSProperties;

  const pillClasses =
    'pill-nav-pill relative overflow-hidden inline-flex items-center justify-center h-full no-underline ' +
    'rounded-pill box-border font-semibold text-[14px] leading-[0] uppercase tracking-[0.4px] ' +
    'whitespace-nowrap cursor-pointer px-0';

  return (
    <div ref={shellRef} className="fixed inset-x-0 top-4 z-50" style={cssVars}>
      <nav
        aria-label="Main"
        className={`mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-5 md:px-8 ${className}`}
      >
        <div className="flex items-center gap-2">
          <a
            href={logoHref}
            aria-label={`${logoAlt} home`}
            onMouseEnter={handleLogoEnter}
            ref={logoRef}
            className="pill-nav-focus inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill p-1.5"
            style={{
              width: 'var(--nav-h)',
              height: 'var(--nav-h)',
              background: 'var(--base)',
            }}
          >
            <img
              src={logo}
              alt={logoAlt}
              ref={logoImgRef}
              width={160}
              height={160}
              className="block h-full w-full object-contain"
            />
          </a>

          {/* Pill group. Shown from lg up rather than md — five labels plus the
              right cluster overflow a 768px viewport. */}
          <div
            ref={navItemsRef}
            className="relative ml-1 hidden items-center rounded-pill lg:flex"
            style={{ height: 'var(--nav-h)', background: 'var(--base)' }}
          >
            <ul
              className="m-0 flex h-full list-none items-stretch p-[3px]"
              style={{ gap: 'var(--pill-gap)' }}
            >
              {items.map((item, i) => {
                const isActive = activeHref === item.href;

                return (
                  <li key={item.href} className="flex h-full">
                    <a
                      href={item.href}
                      aria-label={item.ariaLabel || item.label}
                      aria-current={isActive ? 'true' : undefined}
                      className={pillClasses}
                      style={{
                        background: 'var(--pill-bg)',
                        color: 'var(--pill-text)',
                        paddingLeft: 'var(--pill-pad-x)',
                        paddingRight: 'var(--pill-pad-x)',
                      }}
                      onMouseEnter={() => handleEnter(i)}
                      onMouseLeave={() => handleLeave(i)}
                    >
                      <span
                        className="hover-circle pointer-events-none absolute bottom-0 left-1/2 z-[1] block rounded-full"
                        style={{ background: 'var(--base)', willChange: 'transform' }}
                        aria-hidden
                        ref={el => {
                          circleRefs.current[i] = el;
                        }}
                      />
                      <span className="label-stack relative z-[2] inline-block leading-[1]">
                        <span
                          className="pill-label relative z-[2] inline-block leading-[1]"
                          style={{ willChange: 'transform' }}
                        >
                          {item.label}
                        </span>
                        <span
                          className="pill-label-hover absolute left-0 top-0 z-[3] inline-block"
                          style={{
                            color: 'var(--hover-text)',
                            willChange: 'transform, opacity',
                          }}
                          aria-hidden
                        >
                          {item.label}
                        </span>
                      </span>
                      {isActive && (
                        <span
                          className="absolute -bottom-[6px] left-1/2 z-[4] h-3 w-3 -translate-x-1/2 rounded-full"
                          style={{ background: 'var(--base)' }}
                          aria-hidden
                        />
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {rightSlot}

          <button
            type="button"
            ref={hamburgerRef}
            onClick={toggleMobileMenu}
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="pill-nav-mobile"
            className="pill-nav-focus relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-pill border-0 p-0 lg:hidden"
            style={{
              width: 'var(--nav-h)',
              height: 'var(--nav-h)',
              background: 'var(--base)',
            }}
          >
            <span
              className="hamburger-line h-0.5 w-4 origin-center rounded"
              style={{ background: 'var(--pill-bg)' }}
            />
            <span
              className="hamburger-line h-0.5 w-4 origin-center rounded"
              style={{ background: 'var(--pill-bg)' }}
            />
          </button>
        </div>
      </nav>

      <div
        id="pill-nav-mobile"
        ref={mobileMenuRef}
        // Any link tap closes the sheet; the delegated Lenis handler in main.tsx
        // still performs the scroll.
        onClick={event => {
          if ((event.target as Element).closest('a')) closeMobileMenu();
        }}
        className="absolute left-5 right-5 top-[calc(var(--nav-h)+12px)] origin-top rounded-card-lg p-[3px] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] md:left-8 md:right-8 lg:hidden"
        style={{ background: 'var(--base)' }}
      >
        <ul className="m-0 flex list-none flex-col gap-[3px] p-0">
          {items.map(item => (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={activeHref === item.href ? 'true' : undefined}
                className="pill-nav-mobile-link block rounded-pill px-4 py-3 text-[15px] font-medium"
                style={{ background: 'var(--pill-bg)', color: 'var(--pill-text)' }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        {mobileSlot && <div className="p-3 pt-2">{mobileSlot}</div>}
      </div>
    </div>
  );
}
