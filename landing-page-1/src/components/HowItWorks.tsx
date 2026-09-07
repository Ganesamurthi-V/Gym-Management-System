import { ArrowRight } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

const APP_URL = 'https://app.gymflow.sbs';

const STEPS = [
  {
    num: '01',
    title: 'Sign up and onboard',
    desc: 'A six-step wizard walks you through your gym name, membership plans, pricing and WhatsApp details. It autosaves, so you can stop and come back.',
  },
  {
    num: '02',
    title: 'Import your members',
    desc: 'Upload the CSV or Excel sheet you already keep. GymFlow detects the columns, normalises area names, and flags anything that needs a look.',
  },
  {
    num: '03',
    title: 'Run the day to day',
    desc: 'Mark attendance, record payments, and send WhatsApp reminders for dues — from one dashboard that works just as well on your phone.',
  },
  {
    num: '04',
    title: 'Analyse and grow',
    desc: 'Monthly revenue charts, plan distribution, area spread and PDF reports. Know exactly where the gym stands before the month closes.',
  },
] as const;

export function HowItWorks() {
  const scope = useReveal<HTMLElement>({ stagger: 0.1 });

  return (
    <section
      id="how"
      ref={scope}
      aria-labelledby="how-title"
      className="px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-20">
          {/* ── Sticky intro ────────────────────────────────────────────── */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <span className="reveal eyebrow">How it works</span>
            <h2 id="how-title" className="reveal display-2 mt-4 text-balance">
              Up and running
              <br />
              <span className="text-muted-foreground">in minutes.</span>
            </h2>
            <p className="reveal lead mt-5 max-w-[360px]">
              No IT team, no installation, no consultant. Sign up and start entering your
              first members the same day.
            </p>
            <a href={APP_URL} className="reveal btn btn-primary btn-lg mt-8">
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          {/* ── Steps ───────────────────────────────────────────────────── */}
          <ol className="flex flex-col">
            {STEPS.map((step, index) => (
              <li
                key={step.num}
                className="reveal group grid grid-cols-[auto_1fr] gap-x-5 gap-y-0 border-t border-border-subtle py-8 last:border-b sm:gap-x-8"
              >
                {/* accent-text, not accent-ink: this number sits on the page
                    background, where accent-ink is white and would disappear. */}
                <span className="font-mono text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-accent-text">
                  {step.num}
                </span>
                <div className="min-w-0">
                  <h3 className="display-3 text-balance">{step.title}</h3>
                  <p className="mt-3 max-w-[560px] text-[14.5px] leading-relaxed text-muted-foreground">
                    {step.desc}
                  </p>
                </div>

                {/* Accent rule that draws in on hover — the row's only decoration,
                    and the only thing signalling it is interactive-ish. */}
                <span
                  aria-hidden
                  className="col-span-2 mt-7 h-px origin-left scale-x-0 bg-accent transition-transform duration-500 group-hover:scale-x-100"
                  style={{ transitionDelay: `${index * 20}ms` }}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
