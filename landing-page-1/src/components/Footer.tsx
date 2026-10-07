import { Mail, MapPin, MessageCircle } from 'lucide-react';

const APP_URL = 'https://app.gymflow.sbs';
const SUPPORT_EMAIL = 'support@gymflow.sbs';
const SUPPORT_PHONE_DISPLAY = '+91 93848 86895';
const SUPPORT_PHONE_HREF = '+919384886895';
// A mailto link with the subject and body already filled in, so the visitor's mail app
// opens on a ready-to-send message. encodeURIComponent turns the line breaks and spaces
// into the %0A and %20 a mailto needs.
const MAIL_BODY = [
  'Hi GymFlow team,',
  '',
  'I saw your website and would like to know more about GymFlow for my gym.',
  '',
  'Name:',
  'Gym name:',
  'City:',
  'Phone number:',
  'Thank you.',
].join('\n');
const MAIL_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  'Enquiry about GymFlow',
)}&body=${encodeURIComponent(MAIL_BODY)}`;
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
// wa.me wants the number as digits only, country code first, no + or spaces. The text is
// what appears in the visitor's message box, ready to send, so the first message tells
// support who is writing and why.
const WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE_HREF.replace(/\D/g, '')}?text=${encodeURIComponent(
  'Hi GymFlow, I saw your website and would like to know more about GymFlow for my gym.',
)}`;

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'WhatsApp automation', href: '#whatsapp' },
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
      { label: 'Sign in', href: APP_URL },
    ],
  },
] as const;

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
export function Footer() {
  return (
    <footer className="-mt-[70px] md:-mt-[150px]">
      {/* id lives here rather than on <footer> so the #support anchor lands on
          the visible panel instead of a point hidden behind the CTA card. */}
      <div
        id="support"
        className="border-t border-border-subtle bg-muted px-6 pt-[110px] pb-8 md:px-12 md:pt-[190px]"
      >
        <div className="mx-auto grid max-w-[1240px] gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* ── Brand ─────────────────────────────────────────────────────── */}
          <div>
            <a href="#" aria-label="GymFlow home" className="inline-flex">
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
              <h3 className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                {column.heading}
              </h3>
              <ul className="mt-5 flex flex-col gap-3">
                {column.links.map(link => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
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
            <h3 className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              Contact
            </h3>
            <address className="mt-5 flex flex-col gap-3 text-[13px] not-italic text-muted-foreground">
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
                className="flex items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {SUPPORT_EMAIL}
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Message GymFlow on WhatsApp at ${SUPPORT_PHONE_DISPLAY}`}
                className="flex items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </address>
            <p className="mt-4 text-[12px] text-muted-foreground">
              Priority support on WhatsApp, phone and email.
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
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span
              aria-hidden
              className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-accent"
            />
            All systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}
