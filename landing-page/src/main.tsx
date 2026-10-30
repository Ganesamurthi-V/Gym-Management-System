import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initAnalytics } from './lib/analytics';
import { initSmoothScroll } from './lib/smoothScroll';
import { afterFirstPaint } from './lib/afterFirstPaint';
import { MountedFlag } from './lib/MountedFlag';
import { FallbackBoundary } from './lib/FallbackBoundary';

initAnalytics();

initSmoothScroll();

// React mounts once the static copy in #root has painted. Mounting straight away replaced it within
// the same long task, so the browser never reported it as the largest paint and LCP waited for the
// real hero (3.0-3.7 s on a throttled phone); the 1.5 s ceiling covers a tab that never paints.
afterFirstPaint(
  () => {
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
  },
  1500,
  false
);
