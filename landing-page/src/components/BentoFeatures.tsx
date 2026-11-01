import { useRef, useState, type KeyboardEvent } from 'react';
import { SpotlightSurface } from './fx';
import { MembersVisual, DuesVisual, AttendanceVisual } from './FeatureVisuals';
import { MemberAppCard } from './MemberAppCard';
import { Section } from './layout/Section';
import '../styles/features.css';

// Facts as stated in src/data/featurePages.ts. Each tab has its own illustration (FeatureVisuals.tsx) so the section never repeats the
// dashboard mock of the band above it; the last tab is the member app phone.
const TABS = [
  {
    title: 'Members',
    text: 'Every member, plan and expiry in one searchable list, marked Active, Expiring or Expired.',
    href: '/members',
  },
  {
    title: 'Fees and dues',
    text: 'Record cash, UPI and card payments. Part payments stay on the member as a pending due.',
    href: '/fees-and-dues',
  },
  {
    title: 'Attendance',
    text: 'Check members in at the front desk, or let them check in with their member ID.',
    href: '/attendance',
  },
  {
    title: 'Member app',
    text: 'Members see their plan, visits and digital card on their own phone, with no app store download.',
    href: '/member-app',
  },
] as const;

const MEMBER_APP = 3;

// One visual per tab, in tab order, each with the text a screen reader gets in place of the decorative picture.
const VISUALS = [
  { Visual: MembersVisual, label: 'A searchable member list with one member record open: plan, status and expiry.' },
  { Visual: DuesVisual, label: 'Recording a cash, UPI or card payment, and the list of members who still owe.' },
  { Visual: AttendanceVisual, label: 'The front-desk check-in: a member ID keypad and the member who has just checked in.' },
  { Visual: MemberAppCard, label: 'The member app on a phone: plan, visits and digital card.' },
] as const;

export function BentoFeatures() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (i: number, focus = false) => {
    setActive(i);
    const el = tabs.current[i];
    if (focus) el?.focus();
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = TABS.length - 1;
    let next = active;
    if (e.key === 'ArrowRight') next = active === last ? 0 : active + 1;
    else if (e.key === 'ArrowLeft') next = active === 0 ? last : active - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <Section id="features" labelledBy="features-title" tone="paper">
      <h2 id="features-title" className="display-2 min-w-0 max-w-[20ch] break-words">
        Built for how gyms really run
      </h2>

      <div className="feat-scroll mt-10 md:mt-14">
        <div role="tablist" aria-label="GymFlow features" onKeyDown={onKeyDown} className="feat-tabs">
          <span aria-hidden className="feat-pill" style={{ transform: `translateX(${active * 100}%)` }} />
          {TABS.map((t, i) => (
            <button
              key={t.href}
              ref={el => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`feature-tab-${i}`}
              aria-selected={active === i}
              aria-controls={`feature-panel-${i}`}
              tabIndex={active === i ? 0 : -1}
              onClick={() => select(i)}
              className="feat-tab"
            >
              {t.title}
            </button>
          ))}
        </div>
      </div>

      <div className="feat-copy mt-8">
        {TABS.map((t, i) => (
          <div
            key={t.href}
            role="tabpanel"
            id={`feature-panel-${i}`}
            aria-labelledby={`feature-tab-${i}`}
            data-active={active === i}
            inert={active !== i}
            className="feat-panel"
          >
            <p className="lead max-w-[52ch]">{t.text}</p>
            <a href={t.href} className="feat-link">
              Learn more
            </a>
          </div>
        ))}
      </div>

      <SpotlightSurface className="feat-capture mt-10">
        {VISUALS.map(({ Visual, label }, i) => (
          <div
            key={label}
            className={`feat-layer${i === MEMBER_APP ? ' feat-layer-app' : ''}`}
            data-active={active === i}
            inert={active !== i}
          >
            <p className="sr-only">{label}</p>
            <Visual />
          </div>
        ))}
      </SpotlightSurface>
      <p className="mt-4 text-[14px] text-muted-foreground">Sample data</p>
    </Section>
  );
}
