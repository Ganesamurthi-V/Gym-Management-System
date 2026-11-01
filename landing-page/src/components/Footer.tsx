import { Mail, MapPin, MessageCircle } from 'lucide-react';
import {
  MAIL_BODY,
  MAIL_URL,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  WHATSAPP_URL,
} from '../data/support';
import { homeAnchor } from '../lib/pageAnchors';
import { Rise } from './fx';
import { AsciiLogo } from './ascii';
import '../styles/footer.css';

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

/* Letter close: paper in light, night in dark (bg-background). Wordmark, one sign-off sentence, then the link
   columns in a quiet ruled row. The old negative-margin overlap under the CTA card is gone: the closing band is
   its own section now. */
export function Footer({ reveal = false }: { reveal?: boolean }) {
  return (
    <footer className={reveal ? REVEAL_FOOTER : undefined}>
      {/* id lives here rather than on <footer> so the #support anchor lands on the visible panel. */}
      <div
        id="support"
        className={`border-t border-border-subtle bg-background px-6 pt-20 pb-8 md:px-12 md:pt-28${reveal ? ` ${REVEAL_PANEL}` : ''}`}
      >
        {/* The wordmark: the ASCII logo decodes on view and ripples under the cursor. */}
        <div className="mx-auto max-w-[1240px]">
          <a href={homeAnchor('#')} aria-label="GymFlow home" className="block w-[min(100%,960px)]">
            <AsciiLogo cols={120} />
          </a>
          <Rise as="p" className="mt-6 max-w-[40ch] font-display text-[22px] font-medium leading-snug text-foreground md:text-[24px]">
            Gym management software for independent gyms in India.
          </Rise>
        </div>

        {/* Link columns, one quiet ruled row. */}
        <div className="mx-auto mt-16 grid max-w-[1240px] gap-12 border-t border-border-subtle pt-10 md:grid-cols-[1fr_1fr_1.4fr]">
          {COLUMNS.map(column => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="text-base font-semibold text-foreground">{column.heading}</h3>
              {/* No gap on phones: each link carries its own 44 px tap height. */}
              <ul className="mt-4 flex flex-col md:gap-2">
                {column.links.map(link => (
                  <li key={link.label}>
                    <a
                      href={link.href.startsWith('#') ? homeAnchor(link.href) : link.href}
                      {...('external' in link && link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="footer-link inline-flex min-h-[44px] items-center text-base md:min-h-0"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/*
            Contact. Mirrors the Organization contactPoint and PostalAddress in the
            index.html JSON-LD, so the structured data reflects content a visitor
            can actually see rather than claiming details that appear nowhere.
          */}
          <div>
            <h3 className="text-base font-semibold text-foreground">Contact</h3>
            <address className="mt-4 flex flex-col gap-1 text-base not-italic text-muted-foreground">
              <span className="flex items-start gap-3">
                <MapPin className="mt-1 h-4 w-4 shrink-0" />
                <span className="leading-relaxed">
                  No. 126, Anbu Nagar, Achariyapuram,
                  <br />
                  Villianur, Puducherry 605110
                </span>
              </span>
              <a href={MAIL_URL} onClick={openMail} className="footer-link flex min-h-[44px] items-center gap-3">
                <Mail className="h-4 w-4 shrink-0" />
                {SUPPORT_EMAIL}
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Message GymFlow on WhatsApp at ${SUPPORT_PHONE_DISPLAY}`}
                className="footer-link flex min-h-[44px] items-center gap-3"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                {SUPPORT_PHONE_DISPLAY}
              </a>
              <a
                href="https://www.instagram.com/meetgymflow"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GymFlow on Instagram"
                className="footer-link flex min-h-[44px] items-center gap-3"
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
                  className="h-4 w-4 shrink-0"
                >
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
                </svg>
                Instagram
              </a>
            </address>
            <p className="mt-4 text-base text-muted-foreground">
              Direct founder support on WhatsApp, phone and email. Support in English and Tamil.
            </p>
          </div>
        </div>

        <div className="mx-auto mt-12 flex max-w-[1240px] flex-col-reverse items-center justify-between gap-x-8 gap-y-2 border-t border-border-subtle pt-6 sm:flex-row">
          <p className="text-center text-sm text-muted-foreground sm:text-left">
            © 2026 GymFlow. Built for gym owners, by fitness enthusiasts. Made in India.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('gf:open-cookie-settings'))}
              className="footer-link inline-flex min-h-[44px] items-center text-sm underline underline-offset-2"
            >
              Cookie settings
            </button>
            {/* Not a hard-coded "all systems operational": that was a claim with nothing behind it.
                The live state is on the status page, backed by real monitors. */}
            <a
              href="https://status.gymflow.sbs"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link inline-flex min-h-[44px] items-center text-sm underline underline-offset-2"
            >
              Live system status
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
