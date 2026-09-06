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

export function Footer() {
  return (
    <footer
      id="support"
      className="border-t border-border-subtle bg-muted px-5 pt-16 pb-8 md:px-8"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* ── Brand ─────────────────────────────────────────────────────── */}
          <div>
            <a href="#" aria-label="GymFlow home" className="inline-flex">
              <img
                src="/logo_landspace_without_bg.webp"
                alt="GymFlow"
                width={400}
                height={178}
                loading="lazy"
                decoding="async"
                className="h-9 w-auto"
              />
            </a>
            <p className="mt-5 max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
              All-in-one gym management for independent gym owners. Members, payments,
              attendance, dues and WhatsApp reminders in one place.
            </p>
            <a href={APP_URL} className="btn btn-primary mt-6">
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
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {SUPPORT_EMAIL}
              </a>
              <a
                href={`tel:${SUPPORT_PHONE_HREF}`}
                className="flex items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </address>
            <p className="mt-4 text-[12px] text-muted-foreground">
              Support in Tamil &amp; English.
            </p>
          </div>
        </div>

        <div className="rule mt-14" />

        <div className="flex flex-col-reverse items-center justify-between gap-4 pt-7 sm:flex-row">
          <p className="text-center text-[12px] text-muted-foreground sm:text-left">
            © 2026 GymFlow. Built for gym owners, by fitness enthusiasts. Tamil Nadu &amp;
            Puducherry, India.
          </p>
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span aria-hidden className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
            All systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}
