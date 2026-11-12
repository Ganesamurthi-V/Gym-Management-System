import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initAnalytics } from './lib/analytics';
import { initSmoothScroll } from './lib/smoothScroll';
import { MountedFlag } from './lib/MountedFlag';
import { FallbackBoundary } from './lib/FallbackBoundary';

initAnalytics();

// Lenis smooth scrolling for the whole site, started after the hero has painted (see lib/smoothScroll.ts).
initSmoothScroll();

// The page mounts as soon as the bundle runs; the static copy is never shown first (see index.html).
const root = document.getElementById('root')!;
// Taken before createRoot replaces it, so FallbackBoundary can put it back after a render error.
const fallbackHtml = root.innerHTML;
createRoot(root).render(
  <StrictMode>
    <FallbackBoundary html={fallbackHtml}>
      <MountedFlag />
      <App />
    </FallbackBoundary>
  </StrictMode>
);

