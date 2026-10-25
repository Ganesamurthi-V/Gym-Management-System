import { useReveal } from '../lib/useReveal';
import { sectionIds, type FeaturePage as FeaturePageData } from '../data/featurePages';
import { DocsPager } from './DocsPager';
import { DocsShell } from './DocsShell';
import { FeatureTitle, FeatureShell, RelatedFeatures, ScreenshotsSection, SectionView, TutorialSection } from './featureParts';

/** A page under /features: hero, then the docs shell (sidebar, sections, pager), related pages. */
export function FeaturePage({ page }: { page: FeaturePageData }) {
  // Only the article blocks fade in; the sidebar and table of contents are never transformed,
  // because a transform on a sticky element's ancestor stops it from sticking.
  const scope = useReveal<HTMLDivElement>({ perElement: true, y: 24, duration: 0.7, start: 'top 90%' });
  const ids = sectionIds(page);
  return (
    <FeatureShell>
      <FeatureTitle page={page} />
      <div ref={scope}>
        <DocsShell page={page}>
          <div className="flex flex-col gap-10">
            <TutorialSection page={page} />
            <div className="min-w-0">
              {page.sections.map((section, i) => (
                <SectionView key={section.heading} id={ids[i]} heading={section.heading} blocks={section.blocks} index={i} />
              ))}
            </div>
            <ScreenshotsSection page={page} />
          </div>
          <DocsPager page={page} />
        </DocsShell>
        <RelatedFeatures page={page} />
      </div>
    </FeatureShell>
  );
}
