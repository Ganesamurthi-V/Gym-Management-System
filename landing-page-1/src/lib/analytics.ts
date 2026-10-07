import Clarity from '@microsoft/clarity';

/**
 * Microsoft Clarity (session replays + heatmaps). The project id is public by design (it is
 * visible in the page source of every site that uses Clarity), but it is kept in an env var
 * so a preview or local build never pollutes the production dashboard: with no id, or in
 * dev, nothing loads.
 *
 * Started after the page is idle, not at import: Clarity's recorder is a few tens of KB of
 * script that would otherwise compete with the hero for the main thread on a cheap phone
 * (it showed up in TBT when measured). Clicks before it starts are still recorded as
 * events because the listener below is installed immediately and Clarity queues calls.
 */
const PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;

let started = false;

function start() {
  if (started || !PROJECT_ID) return;
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

export function initAnalytics() {
  if (!import.meta.env.PROD || !PROJECT_ID) return;

  document.addEventListener(
    'click',
    e => {
      const link = (e.target as Element | null)?.closest?.('a');
      const name = link && eventFor(link as HTMLAnchorElement);
      if (name) {
        start();
        Clarity.event(name);
      }
    },
    { capture: true, passive: true },
  );

  const idle = (window as Window & { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback;
  if (idle) idle(start, { timeout: 4000 });
  else setTimeout(start, 2500);
}
