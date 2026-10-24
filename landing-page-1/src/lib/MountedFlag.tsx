import { useLayoutEffect } from 'react';

/**
 * Marks <html> as mounted once React's first commit is in, which is what finally hides the
 * static copy in #root (.mounted #seo-fallback in the head files). A layout effect runs in the
 * same frame as the commit that replaces that copy, so there is no frame with neither on screen.
 */
export function MountedFlag() {
  useLayoutEffect(() => {
    document.documentElement.classList.add('mounted');
  }, []);
  return null;
}
