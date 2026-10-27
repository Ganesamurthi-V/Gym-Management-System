import { Mail, MapPin, MessageCircle } from 'lucide-react';
import {
  MAIL_BODY,
  MAIL_URL,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  WHATSAPP_URL,
} from '../data/support';
import { homeAnchor } from '../lib/pageAnchors';

const APP_URL = 'https://app.gymflow.sbs';
// The same message as a Gmail compose window. Most laptops have no mail app registered
// for mailto, so a click there does nothing; webmail is where those visitors actually are.
const GMAIL_URL = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
  SUPPORT_EMAIL,
)}&su=${encodeURIComponent('Enquiry about GymFlow')}&body=${encodeURIComponent(MAIL_BODY)}`;

// Phones and tablets keep the mailto link, which opens their mail app. A mouse-and-keyboard
// device opens Gmail compose in a new tab instead. The href stays the mailto, so copying
// the link, middle-click and screen readers still get the real address.
function openMail(e: React.MouseEvent<HTMLAnchorElement>) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  e.preventDefault();
  window.open(GMAIL_URL, '_blank', 'noopener,noreferrer');
}
const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Member management', href: '/members' },
      { label: 'Fees and dues', href: '/fees-and-dues' },
      { label: 'Attendance tracking', href: '/attendance' },
      { label: 'Member app and workouts', href: '/member-app' },
      { label: 'WhatsApp reminders', href: '/whatsapp' },
      { label: 'Reports and analytics', href: '/reports' },
      { label: 'Import and export', href: '/import-export' },
      { label: 'How it works', href: '#how' },
      { label: 'Why GymFlow', href: '#why' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'FAQ', href: '#faq' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      // Public status page (Better Stack). Opens in a new tab; it is a separate host.
      { label: 'System status', href: 'https://status.gymflow.sbs', external: true },
      { label: 'Sign in', href: APP_URL },
    ],
  },
] as const;

// Curtain-reveal footer, used by the feature pages only (reveal prop). From lg up the footer
// sticks to the bottom of the viewport behind the page (z-0) while <main> (relative z-10, opaque,
// see FeatureShell) scrolls away over it, so the footer is uncovered rather than scrolled in.
// Pure CSS: no scroll listener, nothing to keep in step with Lenis, and nothing to run on a
// phone, where it stays an ordinary static footer. The feature pages have no CTA card to
// overlap, so the negative margin and the 190px clearance under it are dropped at every width.
// min-h-svh makes the footer a full screen at least (svh, so a phone's collapsing address bar
// cannot leave a strip of page above it): at max scroll the footer is the only thing on screen
// even when its content is shorter than the viewport; the panel stretches and centres its
// content. motion-reduce falls back to the plain static footer, i.e. the final state with no curtain.
const REVEAL_FOOTER =
  'flex min-h-svh flex-col !mt-0 lg:sticky lg:bottom-0 lg:z-0 motion-reduce:lg:static';
const REVEAL_PANEL = 'flex flex-1 flex-col justify-center !pt-20 md:!pt-24 [&>*]:w-full';

/**
 * Neutral panel that the CTA card overlaps. It was the filled accent blue, which put the
 * loudest block on the page at the very end of it; every other saturated block now
 * stands alone in its own section, and the page closes quietly.
 *
 * The negative top margin pulls the panel up under the card; the panel's top
 * padding is that overlap plus clearance, so footer content still starts below
 * the card's lower edge. The two values have to move together — shrink the
 * padding without shrinking the margin and the links slide under the card.
 *
 * The panel is full-bleed: it runs edge to edge with no side gutters or rounded
 * corners, so it reaches both page edges. The old side padding and the
 * panel's own max-width/mx-auto did the insetting; both are gone. Readability is
 * kept by the inner wrapper below, which re-applies the max-w-[1240px] centring
 * to the *content* rather than the coloured panel.
 */
export function Footer({ reveal = false }: { reveal?: boolean }) {
  return (
    <footer className={`-mt-[70px] md:-mt-[150px]${reveal ? ` ${REVEAL_FOOTER}` : ''}`}>
      {/* id lives here rather than on <footer> so the #support anchor lands on
          the visible panel instead of a point hidden behind the CTA card. */}
      <div
        id="support"
        className={`border-t border-border-subtle bg-muted px-6 pt-[110px] pb-8 md:px-12 md:pt-[190px]${reveal ? ` ${REVEAL_PANEL}` : ''}`}
      >
        <div className="mx-auto grid max-w-[1240px] gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* ── Brand ─────────────────────────────────────────────────────── */}
          <div>
            <a href={homeAnchor('#')} aria-label="GymFlow home" className="inline-flex">
              {/* The wordmark is dark-inked for light backgrounds. On the dark theme
                  brightness-0 crushes it to black and invert lifts it to solid white,
                  which is how the navbar reuses the same asset.

                  Responsive: h-12 (48px) on mobile, h-20 (80px) from md up. The
                  footer has room for a large mark on desktop, but h-25 (100px)
                  was oversized on a phone. */}
              <img
                src="/logo_landspace_without_bg.webp"
                alt="GymFlow"
                width={400}
                height={178}
                loading="lazy"
                decoding="async"
                className="h-12 w-auto dark:brightness-0 dark:invert md:h-20"
              />
            </a>
            <p className="mt-5 max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
              All-in-one gym management for independent gym owners. Members, payments,
              attendance, dues and WhatsApp reminders in one place.
            </p>
            <a
              href={APP_URL}
              className="btn btn-primary mt-6"
            >
              Start free trial
            </a>
          </div>

          {/* ── Link columns ──────────────────────────────────────────────── */}
          {COLUMNS.map(column => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="text-sm font-semibold text-foreground">
                {column.heading}
              </h3>
              {/* No gap: each link carries its own 44 px tap height (13.5px text, so the rows were 17 px); desktop keeps the compact rows. */}
              <ul className="mt-5 flex flex-col md:gap-3">
                {column.links.map(link => (
                  <li key={link.label}>
                    <a
                      href={link.href.startsWith('#') ? homeAnchor(link.href) : link.href}
                      {...('external' in link && link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="inline-flex min-h-[44px] items-center text-[13.5px] md:min-h-0 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/*
            ── Contact ───────────────────────────────────────────────────────
            Mirrors the Organization contactPoint and PostalAddress in the
            index.html JSON-LD, so the structured data reflects content a visitor
            can actually see rather than claiming details that appear nowhere.
          */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Contact
            </h3>
            <address className="mt-5 flex flex-col gap-1 text-[13px] not-italic text-muted-foreground">
              <span className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="leading-relaxed">
                  No. 126, Anbu Nagar, Achariyapuram,
                  <br />
                  Villianur, Puducherry 605110
                </span>
              </span>
              <a
                href={MAIL_URL}
                onClick={openMail}
                className="flex min-h-[44px] items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {SUPPORT_EMAIL}
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Message GymFlow on WhatsApp at ${SUPPORT_PHONE_DISPLAY}`}
                className="flex min-h-[44px] items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                {SUPPORT_PHONE_DISPLAY}
              </a>
              <a
                href="https://www.instagram.com/meetgymflow"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GymFlow on Instagram"
                className="flex min-h-[44px] items-center gap-2.5 transition-colors hover:text-foreground"
              >
                {/* lucide-react v1 dropped brand icons, so the Instagram glyph is inline. */}
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                >
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
                </svg>
                Instagram
              </a>
            </address>
            <p className="mt-4 text-[12px] text-muted-foreground">
              Direct founder support on WhatsApp, phone and email. Support in English and Tamil.
            </p>
          </div>
        </div>

        {/* Was .rule, which draws with --border and would vanish on the panel.
            Shares the grid's max-w-[1240px] mx-auto so the rule and the bottom
            bar line up with the content columns, not the full-bleed panel. */}
        <div aria-hidden className="mx-auto mt-14 h-px max-w-[1240px] bg-border-subtle" />

        <div className="mx-auto flex max-w-[1240px] flex-col-reverse items-center justify-between gap-4 pt-7 sm:flex-row">
          <p className="text-center text-[12px] text-muted-foreground sm:text-left">
            © 2026 GymFlow. Built for gym owners, by fitness enthusiasts. Made in India.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('gf:open-cookie-settings'))}
            className="inline-flex min-h-[44px] items-center text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Cookie settings
          </button>
          {/* Not a hard-coded "all systems operational": that was a claim with nothing behind it.
              The live state is on the status page, backed by real monitors. */}
          <a
            href="https://status.gymflow.sbs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Live system status
          </a>
        </div>
      </div>
    </footer>
  );
}
