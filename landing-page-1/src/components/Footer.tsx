import { Mail, MapPin, Phone } from 'lucide-react';

const APP_URL = 'https://app.gymflow.sbs';
const SUPPORT_EMAIL = 'ganesamurthiv@gmail.com';
const SUPPORT_PHONE_DISPLAY = '+91 93848 86895';
const SUPPORT_PHONE_HREF = '+919384886895';

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
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
      { label: 'Sign in', href: APP_URL },
    ],
  },
] as const;

/**
 * Filled accent panel that the CTA card overlaps.
 *
 * The negative top margin pulls the panel up under the card; the panel's top
 * padding is that overlap plus clearance, so footer content still starts below
 * the card's lower edge. The two values have to move together — shrink the
 * padding without shrinking the margin and the links slide under the card.
 */
export function Footer() {
  return (
    <footer className="-mt-[70px] px-5 pb-5 md:-mt-[150px] md:px-8 md:pb-8">
      {/* id lives here rather than on <footer> so the #support anchor lands on
          the visible panel instead of a point hidden behind the CTA card. */}
      <div
        id="support"
        className="mx-auto max-w-[1240px] rounded-card-lg bg-card-primary px-6 pt-[110px] pb-8 md:px-12 md:pt-[190px]"
      >
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* ── Brand ─────────────────────────────────────────────────────── */}
          <div>
            <a href="#" aria-label="GymFlow home" className="inline-flex">
              {/* The wordmark is dark-inked for light backgrounds. brightness-0
                  crushes it to black and invert lifts it to solid white, which is
                  the only way to reuse the one asset on a filled accent panel. */}
              <img
                src="/logo_landspace_without_bg.webp"
                alt="GymFlow"
                width={400}
                height={178}
                loading="lazy"
                decoding="async"
                className="h-9 w-auto brightness-0 invert"
              />
            </a>
            <p className="mt-5 max-w-[280px] text-[13px] leading-relaxed text-accent-ink/80">
              All-in-one gym management for independent gym owners. Members, payments,
              attendance, dues and WhatsApp reminders in one place.
            </p>
            <a
              href={APP_URL}
              className="btn mt-6 bg-accent-ink text-accent hover:bg-accent-ink/90"
            >
              Start free trial
            </a>
          </div>

          {/* ── Link columns ──────────────────────────────────────────────── */}
          {COLUMNS.map(column => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-accent-ink/80">
                {column.heading}
              </h3>
              <ul className="mt-5 flex flex-col gap-3">
                {column.links.map(link => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-[13.5px] text-accent-ink/80 transition-colors hover:text-accent-ink"
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
            <h3 className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-accent-ink/80">
              Contact
            </h3>
            <address className="mt-5 flex flex-col gap-3 text-[13px] not-italic text-accent-ink/80">
              <span className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="leading-relaxed">
                  No. 126, Anbu Nagar, Achariyapuram,
                  <br />
                  Villianur, Puducherry 605110
                </span>
              </span>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex items-center gap-2.5 transition-colors hover:text-accent-ink"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {SUPPORT_EMAIL}
              </a>
              <a
                href={`tel:${SUPPORT_PHONE_HREF}`}
                className="flex items-center gap-2.5 transition-colors hover:text-accent-ink"
              >
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </address>
            <p className="mt-4 text-[12px] text-accent-ink/80">
              Priority support on WhatsApp, phone and email.
            </p>
          </div>
        </div>

        {/* Was .rule, which draws with --border and would vanish on the panel */}
        <div aria-hidden className="mt-14 h-px bg-accent-ink/20" />

        <div className="flex flex-col-reverse items-center justify-between gap-4 pt-7 sm:flex-row">
          <p className="text-center text-[12px] text-accent-ink/80 sm:text-left">
            © 2026 GymFlow. Built for gym owners, by fitness enthusiasts. Made in India.
          </p>
          <p className="flex items-center gap-2 text-[12px] text-accent-ink/80">
            {/* bg-accent-ink, not bg-accent: --accent on --card-primary is one
                step of the same blue and reads as invisible. */}
            <span
              aria-hidden
              className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-accent-ink"
            />
            All systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}
