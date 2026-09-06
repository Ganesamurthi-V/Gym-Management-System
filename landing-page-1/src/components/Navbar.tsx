import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileUp,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  Map,
  Menu,
  MessageSquare,
  Route,
  Users,
  X,
  ChevronDown,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const APP_URL = 'https://app.gymflow.sbs';

const PRODUCT_ITEMS = [
  {
    icon: LayoutDashboard,
    label: 'Dashboard & live stats',
    desc: 'Active members, collection, dues',
    href: '#features',
  },
  { icon: Users, label: 'Member management', desc: 'Records, search, plans', href: '#features' },
  { icon: CreditCard, label: 'Payments & dues', desc: 'Cash, UPI, card, reminders', href: '#features' },
  { icon: CheckCircle2, label: 'One-tap attendance', desc: 'Daily marking and history', href: '#features' },
  { icon: MessageSquare, label: 'WhatsApp automation', desc: 'Unlimited, built in', href: '#whatsapp' },
  { icon: FileUp, label: 'CSV & Excel import', desc: 'Bring your existing members', href: '#features' },
] as const;

const RESOURCE_ITEMS = [
  { icon: Route, label: 'How it works', desc: 'From signup to daily use', href: '#how' },
  { icon: Map, label: 'Coverage', desc: 'Independent gyms across India', href: '#testimonials' },
  { icon: HelpCircle, label: 'FAQ', desc: 'Trial, pricing, data safety', href: '#faq' },
  { icon: LifeBuoy, label: 'Support', desc: 'Priority support, included', href: '#support' },
] as const;

const MOBILE_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#whatsapp', label: 'WhatsApp' },
  { href: '#how', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
  { href: '#support', label: 'Support' },
] as const;

type MenuId = 'product' | 'resources';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      // rAF-throttled and passive so the handler never blocks the scroll thread.
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 16);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Dismiss the dropdown on Escape or on any pointer press outside the header.
  // Without the outside-press handler the panel would sit open while the visitor
  // interacts with the page behind it.
  useEffect(() => {
    if (!openMenu) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openMenu]);

  // Lock body scroll behind the mobile sheet so the page underneath doesn't move.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header
      ref={navRef}
      className="fixed inset-x-0 top-0 z-50"
      style={{
        background: scrolled
          ? 'color-mix(in srgb, var(--background) 82%, transparent)'
          : 'color-mix(in srgb, var(--background) 60%, transparent)',
        backdropFilter: 'blur(18px) saturate(180%)',
        WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
        // Own compositor layer, so the blur isn't re-rasterised with the page on
        // every scroll frame.
        transform: 'translateZ(0)',
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between gap-6 px-5 md:px-8"
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
               white — the same treatment the footer logo uses on its blue panel. */
            className="h-8 w-auto dark:brightness-0 dark:invert"
          />
        </a>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          <DropdownTrigger
            id="product"
            label="Product"
            items={PRODUCT_ITEMS}
            columns={2}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
          />
          <DropdownTrigger
            id="resources"
            label="Resources"
            items={RESOURCE_ITEMS}
            columns={1}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
          />
          <a
            href="#pricing"
            className="rounded-pill px-3.5 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
          >
            Pricing
          </a>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={APP_URL}
            className="hidden rounded-pill px-3.5 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground sm:inline-flex"
          >
            Sign in
          </a>
          <a href={APP_URL} className="btn btn-primary hidden sm:inline-flex">
            Start free trial
          </a>

          <button
            type="button"
            onClick={() => setMobileOpen(open => !open)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="grid h-9 w-9 place-items-center rounded-pill border border-border-subtle bg-frame text-foreground lg:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div
          className="animate-fade-in-up fixed inset-x-0 top-[68px] bottom-0 overflow-y-auto border-t border-border-subtle bg-background px-5 py-6 lg:hidden"
          onClick={event => {
            // Any link tap closes the sheet; the delegated Lenis handler in
            // main.tsx still performs the scroll.
            if ((event.target as Element).closest('a')) setMobileOpen(false);
          }}
        >
          <ul className="flex flex-col">
            {MOBILE_LINKS.map(link => (
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

/* ─────────────────────────────────────────────────────────────────────────── */

interface DropdownItem {
  readonly icon: typeof Users;
  readonly label: string;
  readonly desc: string;
  readonly href: string;
}

interface DropdownTriggerProps {
  id: MenuId;
  label: string;
  items: readonly DropdownItem[];
  columns: 1 | 2;
  openMenu: MenuId | null;
  setOpenMenu: (id: MenuId | null) => void;
}

function DropdownTrigger({
  id,
  label,
  items,
  columns,
  openMenu,
  setOpenMenu,
}: DropdownTriggerProps) {
  const isOpen = openMenu === id;
  const panelId = `nav-panel-${id}`;

  return (
    <div
      className="relative"
      // Hover opens it for pointer users; the button still works on click and on
      // keyboard, so touch and keyboard visitors are not shut out.
      onMouseEnter={() => setOpenMenu(id)}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpenMenu(isOpen ? null : id)}
        className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13.5px] font-medium transition-colors ${
          isOpen ? 'bg-subtle text-foreground' : 'text-muted-foreground hover:bg-subtle hover:text-foreground'
        }`}
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          id={panelId}
          className="animate-fade-in-up absolute left-0 top-[calc(100%+10px)] card overflow-hidden p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]"
          style={{ width: columns === 2 ? 520 : 300 }}
        >
          <ul className={columns === 2 ? 'grid grid-cols-2 gap-1' : 'flex flex-col gap-1'}>
            {items.map(item => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <a
                    href={item.href}
                    onClick={() => setOpenMenu(null)}
                    className="flex items-start gap-3 rounded-2xl p-3 transition-colors hover:bg-subtle"
                  >
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft">
                      <Icon className="h-4 w-4 text-accent-text" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium leading-tight text-foreground">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {item.desc}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
