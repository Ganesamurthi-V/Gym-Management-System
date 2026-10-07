import Clarity from '@microsoft/clarity';

/**
 * Analytics: Microsoft Clarity (session replays + heatmaps) and Google Analytics 4. The project id is public by design (it is
 * visible in the page source of every site that uses Clarity), but it is kept in an env var
 * so a preview or local build never pollutes the production dashboard: with no id, or in
 * dev, nothing loads.
 *
 * Only runs after the visitor accepts all cookies (see CookieBanner). Started after the page is idle, not at import: Clarity's recorder is a few tens of KB of
 * script that would otherwise compete with the hero for the main thread on a cheap phone
 * (it showed up in TBT when measured). Clicks before it starts are still recorded as
 * events because the listener below is installed immediately and Clarity queues calls.
 */
const PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;

/**
 * Google Analytics 4. The measurement id is public (it ships in the page source of every
 * site using GA), so it is the default here; the env var can point a preview build at a
 * different property. The tag is injected only after the visitor accepts cookies: pasting
 * Google's snippet into index.html would load it, and set its cookies, for everyone.
 */
const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || 'G-X851XRNHBD';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let started = false;
let gaStarted = false;

function startGA() {
  if (gaStarted || !GA_ID) return;
  gaStarted = true;
  window.dataLayer = window.dataLayer || [];
  // gtag.js reads `arguments` objects from the dataLayer, so this must be a plain function,
  // not an arrow function that would pass an array instead.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
}

function start() {
  if (getConsent()?.ga) startGA();
  if (started || !PROJECT_ID || !getConsent()?.clarity) return;
  started = true;
  Clarity.init(PROJECT_ID);
  Clarity.setTag('site', 'landing');
}

/** Outbound intent worth a named event: these are the funnel's real steps. */
function eventFor(link: HTMLAnchorElement): string | null {
  const href = link.href;
  if (href.startsWith('https://app.gymflow.sbs')) return 'click_open_app';
  if (href.startsWith('https://wa.me') || href.includes('whatsapp.com')) return 'click_whatsapp';
  if (href.startsWith('mailto:') || href.includes('mail.google.com')) return 'click_email';
  if (href.startsWith('tel:')) return 'click_phone';
  return null;
}

const CONSENT_KEY = 'gf-cookie-consent-v2';
export const OPEN_SETTINGS_EVENT = 'gf:open-cookie-settings';

/** Each optional cookie group is its own choice; essential cookies are not optional. */
export interface Consent {
  /** Google Analytics: visit statistics. */
  ga: boolean;
  /** Microsoft Clarity: heatmaps and session recordings. */
  clarity: boolean;
}

export function getConsent(): Consent | null {
  try {
    const v = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null');
    return v && typeof v.ga === 'boolean' && typeof v.clarity === 'boolean' ? v : null;
  } catch {
    return null;
  }
}

/** Analytics cookies Google and Microsoft could have set on this site. */
function clearAnalyticsCookies() {
  const host = location.hostname;
  const domains = [host, `.${host}`, `.${host.replace(/^www\./, '')}`];
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim();
    if (!/^(_ga|_gid|_gat|_clck|_clsk|CLID|ANONCHK|MR|MUID|SM)/.test(name)) continue;
    for (const d of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
    }
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/**
 * Saves the visitor's choice. Switching something on starts it now. Switching something off
 * cannot unload a script that is already running, so its cookies are cleared and the page
 * reloads without it.
 */
export function setConsent(next: Consent) {
  const prev = getConsent();
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode: the choice just will not be remembered */
  }
  if ((prev?.ga && !next.ga) || (prev?.clarity && !next.clarity)) {
    clearAnalyticsCookies();
    location.reload();
    return;
  }
  initAnalytics();
}

let listening = false;

/**
 * Nothing loads, and no analytics cookie is set, until the visitor has chosen "Accept all".
 * "Essential only" keeps Clarity (and any Google Analytics) off entirely.
 */
export function initAnalytics() {
  const consent = getConsent();
  if (!import.meta.env.PROD || !consent || (!consent.ga && !consent.clarity)) return;

  if (!listening) {
    listening = true;
    document.addEventListener(
      'click',
      e => {
        const link = (e.target as Element | null)?.closest?.('a');
        const name = link && eventFor(link as HTMLAnchorElement);
        if (name) {
          start();
          if (started) Clarity.event(name);
          if (getConsent()?.ga) window.gtag?.('event', name);
        }
      },
      { capture: true, passive: true },
    );
  }

  const idle = (window as Window & { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback;
  if (idle) idle(start, { timeout: 4000 });
  else setTimeout(start, 2500);
}
