import { useEffect, useState } from 'react';
import { AsciiStrip } from './AsciiStrip';
import { getConsent, setConsent, OPEN_SETTINGS_EVENT, type Consent } from '@/lib/analytics';

type View = 'closed' | 'banner' | 'details';

const NONE: Consent = { ga: false, clarity: false };
const ALL: Consent = { ga: true, clarity: true };

/**
 * Cookie choices. First visit: a small banner in the corner (shown after the page has
 * loaded, so it is never the largest paint). "Choose", or the footer's "Cookie settings" at
 * any later time, opens a card in the middle of the screen with the full detail of each
 * group and its own switch.
 */
export function CookieBanner() {
  const [view, setView] = useState<View>('closed');
  const [draft, setDraft] = useState<Consent>(NONE);

  useEffect(() => {
    const onOpen = () => {
      setDraft(getConsent() ?? NONE);
      setView('details');
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    let timer: number | undefined;
    if (getConsent() === null) timer = window.setTimeout(() => setView('banner'), 1200);
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (view !== 'details') return;
    // The page scrolls through Lenis, which listens for the wheel on the whole window and
    // would scroll the site behind the card. Locking the page's own scroll stops that; the
    // card itself opts out of Lenis with data-lenis-prevent (see the card below).
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView(getConsent() === null ? 'banner' : 'closed');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      html.style.overflow = previous;
    };
  }, [view]);

  const save = (choice: Consent) => {
    setView('closed');
    setConsent(choice);
  };

  if (view === 'closed') return null;

  const outline =
    'rounded-pill border border-border-strong px-4 py-2 text-sm font-medium text-foreground hover:bg-subtle';
  const solid =
    'rounded-pill bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90';

  if (view === 'banner') {
    return (
      <div
        role="dialog"
        aria-label="Cookie preferences"
        className="fixed inset-x-3 bottom-3 z-[90] ml-auto max-w-sm overflow-hidden rounded-2xl border border-border-strong bg-background shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5"
      >
        <AsciiStrip />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          We use small files called cookies. Some keep the site working. Others help us see how
          people use it. You decide which ones to allow.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => save(NONE)} className={outline}>
            Essential only
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(getConsent() ?? NONE);
              setView('details');
            }}
            className={outline}
          >
            Choose
          </button>
          <button type="button" onClick={() => save(ALL)} className={solid}>
            Accept all
          </button>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-3 sm:p-6">
      <div
        aria-hidden
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setView(getConsent() === null ? 'banner' : 'closed')}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-title"
        data-lenis-prevent
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-border-strong bg-background p-5 shadow-2xl sm:p-7"
      >
        <h2 id="cookie-title" className="text-xl font-medium tracking-tight text-foreground">
          Cookie preferences
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Cookies are small files saved on your phone or computer. Pick which ones you are fine
          with. You can change your mind any time using &ldquo;Cookie settings&rdquo; at the bottom
          of the page. More in our{' '}
          <a href="/privacy#analytics" className="text-foreground underline underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>

        <div className="mt-5 space-y-3">
          <Group
            title="Essential"
            note="Always on"
            checked
            disabled
            rows={[
              ['What it is for', 'Remembers things like your choice here and light or dark mode, so the site works properly.'],
              ['Your data', 'Stays on your device. Nothing is sent anywhere.'],
            ]}
          />
          <Group
            title="Visit counting"
            note="Optional, from Google"
            checked={draft.ga}
            onChange={ga => setDraft(d => ({ ...d, ga }))}
            rows={[
              ['What it is for', 'Tells us how many people visit and how they found us, so we know what is working.'],
              ['What it sees', 'Which parts of the page you open and roughly which city you are in. Never your name or phone number.'],
            ]}
          />
          <Group
            title="Seeing where people tap"
            note="Optional, from Microsoft"
            checked={draft.clarity}
            onChange={clarity => setDraft(d => ({ ...d, clarity }))}
            rows={[
              ['What it is for', 'Shows us where people tap and where they get stuck, so we can make the page easier to use.'],
              ['What it sees', 'Where you tap and scroll, as an anonymous recording. Anything you type is hidden.'],
            ]}
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => save(NONE)} className={outline}>
            Essential only
          </button>
          <button type="button" onClick={() => save(draft)} className={outline}>
            Save my choices
          </button>
          <button type="button" onClick={() => save(ALL)} className={solid}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({
  title,
  note,
  rows,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  note: string;
  rows: [string, string][];
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-subtle p-4">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="block text-[12px] text-muted-foreground">{note}</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-current"
          checked={checked}
          disabled={disabled}
          aria-label={`Allow ${title}`}
          onChange={e => onChange?.(e.target.checked)}
        />
      </label>
      <dl className="mt-3 space-y-2 border-t border-border-subtle pt-3 text-[12.5px] leading-snug">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="font-medium text-foreground">{k}</dt>
            <dd className="text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
