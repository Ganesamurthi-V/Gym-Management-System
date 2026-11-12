import { useEffect } from 'react';
import type { FeaturePage as FeaturePageData } from '../data/featurePages';
import { ArticleBody, ArticleFooter, ArticleHeader, FeatureShell, ScreenshotsSection, TutorialSection } from './featureParts';

/**
 * A page under /features, /pricing or a guide: one article layout for all of them (slim head, 72ch column,
 * "On this page" rail, related pages, one call to action).
 */
export function FeaturePage({ page }: { page: FeaturePageData }) {
  // The page is rendered by React after load, so the browser's own jump to /slug#section finds
  // nothing (the static copy is display:none). Jump once the sections exist, and again after the
  // web fonts have shifted the layout.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const jump = () => document.getElementById(id)?.scrollIntoView();
    const frame = requestAnimationFrame(jump);
    const later = window.setTimeout(jump, 700);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
    };
  }, []);
  return (
    <FeatureShell>
      <ArticleHeader page={page} />
      <ArticleBody page={page} lead={<TutorialSection page={page} />}>
        <ScreenshotsSection page={page} />
      </ArticleBody>
      <ArticleFooter page={page} />
    </FeatureShell>
  );
}
