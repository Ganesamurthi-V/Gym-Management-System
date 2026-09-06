import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ArrowRight, MapPin } from 'lucide-react';
import { Marquee } from './Marquee';
import { DashboardMock } from './DashboardMock';
import { prefersReducedMotion } from '../lib/useReveal';
import { useMediaQuery } from '../lib/useMediaQuery';

const APP_URL = 'https://app.gymflow.sbs';

/**
 * Coverage, not a customer list. A logo strip of named gyms would assert
 * specific clients the site cannot evidence; where the product is available is
 * a fact. Spread across regions so the strip reads as national reach rather
 * than one state.
 */
const CITIES = [
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Pune',
  'Ahmedabad',
  'Jaipur',
  'Lucknow',
] as const;

const TRUST_POINTS = ['14-day free trial', 'No credit card', 'Cancel anytime'] as const;

export function Hero() {
  const scope = useRef<HTMLElement>(null);
  const interactive = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      // Entrance runs on mount rather than on scroll — the hero is already in
      // view on load, so a ScrollTrigger here would never fire.
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.hero-badge', { y: 16, opacity: 0, duration: 0.5 })
        .from('.hero-line', { y: 30, opacity: 0, duration: 0.75, stagger: 0.1 }, '-=0.25')
        .from('.hero-sub', { y: 18, opacity: 0, duration: 0.6 }, '-=0.4')
        .from('.hero-cta', { y: 16, opacity: 0, duration: 0.55, stagger: 0.08 }, '-=0.35')
        .from('.hero-trust', { opacity: 0, duration: 0.5 }, '-=0.3')
        .from('.hero-frame', { y: 40, opacity: 0, duration: 0.9 }, '-=0.45')
        .from('.hero-marquee', { opacity: 0, duration: 0.6 }, '-=0.4');
    }, scope);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={scope} className="relative overflow-hidden px-5 pt-[124px] pb-16 md:px-8">
      {/* Brand-hue mesh behind the headline and product shot. Spans the full
          width rather than a centred 900px block, so the colour reaches behind
          the dashboard frame the way it does in the reference. */}
      <div
        aria-hidden
        className="hero-mesh pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px]"
      />

      <div className="mx-auto max-w-[1240px]">
        {/* ── Copy ──────────────────────────────────────────────────────── */}
        {/* 900px fits the longest headline line with headroom for the serif's
            wider metrics, without letting the measure sprawl. */}
        <div className="mx-auto max-w-[900px] text-center">
          <span className="hero-badge pill pill-accent">
            <MapPin className="h-3.5 w-3.5" />
            Built for independent gyms across India
            <span aria-hidden className="text-accent-text">
              ✦
            </span>
          </span>

          {/* Two explicit lines rather than one balanced block. Left to wrap on
              its own the heading broke as "Built to make gym / management
              effortless.", splitting the compound noun, and text-balance cannot
              fix that because it only chooses where to break, not what stays
              together. Fixing the break needs the phrase to fall in two units.

              <em> rather than a styled span: "effortless" carries the stress of
              the sentence, so the emphasis is real and not just decoration. */}
          <h1 className="display-1 mt-8">
            <span className="hero-line block">Gym management,</span>
            <span className="hero-line block">
              made <em className="display-accent">effortless.</em>
            </span>
          </h1>

          {/* Trimmed to two lines. The full product definition still lives in the
              meta description and the features section; repeating it here only
              pushed the product shot below the fold. */}
          <p className="hero-sub lead mx-auto mt-7 max-w-[620px]">
            Members, payments, attendance, dues and WhatsApp reminders — in one place,
            without the notebooks.
          </p>

          {/* Stacked and equal width on phones, inline from sm up — two pills of
              different widths stacked centre-aligned reads as a mistake. */}
          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <a href={APP_URL} className="hero-cta btn btn-primary btn-lg">
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#pricing" className="hero-cta btn btn-outline btn-lg">
              See pricing
            </a>
          </div>

          <ul className="hero-trust mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {TRUST_POINTS.map(point => (
              <li
                key={point}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Product shot ──────────────────────────────────────────────── */}
        <div className="hero-frame mt-16 md:mt-20">
          <div className="card mx-auto max-w-[1060px] overflow-hidden p-1.5 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.35)]">
            {/* Window chrome — reads as "this is the real product", and costs
                three dots to say it. */}
            <div className="flex items-center gap-1.5 px-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              <span className="ml-3 font-mono text-[11px] text-muted-foreground">
                app.gymflow.sbs
              </span>
            </div>
            {/*
              The live mock is a fixed 1160px canvas scaled to fit. Below ~1024px
              that scale drops under 0.6 and the dashboard's 9-11px UI text stops
              being readable — at phone widths it lands around 2.5px. An
              interactive panel nobody can read or hit is worse than a picture of
              one, so narrow viewports keep the original screenshot, which also
              leaves the mobile LCP on a fast cached image.
            */}
            {interactive ? (
              <>
                {/* The mock is aria-hidden, so this carries what the old alt
                    attribute did — without it the product shot goes silent. */}
                <p className="sr-only">
                  The GymFlow dashboard showing active members, today&apos;s collection,
                  memberships expiring soon and total outstanding dues. Sidebar
                  navigation covers members, payments, dues, attendance and inventory.
                </p>
                <DashboardMock />
              </>
            ) : (
              <img
                src="/hero.webp"
                alt="The GymFlow dashboard showing active members, today's collection, memberships expiring soon and total outstanding dues."
                width={1160}
                height={617}
                // Above the fold: eager + high priority, and never lazy — lazy here
                // would delay the largest contentful paint on purpose.
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="block w-full rounded-2xl border border-border-subtle"
              />
            )}
          </div>
        </div>

        {/* ── Coverage marquee ──────────────────────────────────────────── */}
        <div className="hero-marquee mt-16">
          <p className="mb-6 text-center text-xs font-medium tracking-wide text-muted-foreground">
            Serving independent gyms across India
          </p>
          <Marquee items={CITIES} durationSeconds={38} />
        </div>
      </div>
    </section>
  );
}
