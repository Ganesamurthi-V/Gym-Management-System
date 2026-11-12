import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initAnalytics } from './lib/analytics';
import { MountedFlag } from './lib/MountedFlag';
import { FallbackBoundary } from './lib/FallbackBoundary';
import { getFeaturePage } from './data/featurePages';
import { FeaturePage } from './pages/FeaturePage';
import { FeaturesHub } from './pages/FeaturesHub';

// Shared entry for /features and the seven pages under it. Each page's HTML file (members.html,
// ...) names its page in data-page on #root; the head tags and the no-JavaScript copy inside
// #root were written into that file at build time from the same data (see vite.config.ts).
initAnalytics();

const root = document.getElementById('root')!;
const page = getFeaturePage(root.dataset.page ?? '');
if (!page) throw new Error(`Unknown feature page: ${root.dataset.page}`);

// The page mounts as soon as the bundle runs; the static copy is never shown first (see index.html).
// Taken before createRoot replaces it, so FallbackBoundary can put it back after a render error.
const fallbackHtml = root.innerHTML;
createRoot(root).render(
  <StrictMode>
    <FallbackBoundary html={fallbackHtml}>
      <MountedFlag />
      {page.slug === 'features' ? <FeaturesHub page={page} /> : <FeaturePage page={page} />}
    </FallbackBoundary>
  </StrictMode>
);

