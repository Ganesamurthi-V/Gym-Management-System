import { sectionIds, type FeaturePage as FeaturePageData } from '../data/featurePages';
import { DocsPager } from './DocsPager';
import { DocsShell } from './DocsShell';
import { FeatureTitle, FeatureShell, RelatedFeatures, ScreenshotsSection, SectionView, TutorialSection } from './featureParts';

/** A page under /features: hero, then the docs shell (sidebar, sections, pager), related pages. */
export function FeaturePage({ page }: { page: FeaturePageData }) {
  const ids = sectionIds(page);
  return (
    <FeatureShell>
      <div>
        <DocsShell page={page}>
          <FeatureTitle page={page} />
          <div className="flex flex-col gap-10">
            <TutorialSection page={page} />
            <div className="min-w-0">
              {page.sections.map((section, i) => (
                <SectionView key={section.heading} id={ids[i]} heading={section.heading} blocks={section.blocks} />
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
