import type { FeaturePage as FeaturePageData } from '../data/featurePages';
import { DocsPager } from './DocsPager';
import { DocsShell } from './DocsShell';
import {
  DocSections,
  FeatureClose,
  FeatureHead,
  FeatureSections,
  FeatureShell,
  MoreFromGymFlow,
  RelatedFeatures,
  ScreenshotsSection,
  TutorialSection,
} from './featureParts';

/**
 * A page under /features, /pricing or a guide. Guides read in the docs shell (sidebar, 65ch article,
 * table of contents); the feature pages and pricing are composed full width, one arrangement per section.
 */
export function FeaturePage({ page }: { page: FeaturePageData }) {
  const guide = page.group === 'Guides';
  return (
    <FeatureShell>
      {guide ? (
        <>
          <FeatureHead page={page} />
          <DocsShell page={page}>
            <TutorialSection page={page} inline />
            <DocSections page={page} />
            <ScreenshotsSection page={page} inline />
            <DocsPager page={page} />
          </DocsShell>
        </>
      ) : (
        <>
          <FeatureHead page={page} search />
          <TutorialSection page={page} />
          <FeatureSections page={page} />
          <ScreenshotsSection page={page} />
          <div className="px-5 md:px-8">
            <div className="mx-auto max-w-[1200px]">
              <DocsPager page={page} />
            </div>
          </div>
        </>
      )}
      <RelatedFeatures page={page} />
      <MoreFromGymFlow page={page} />
      <FeatureClose />
    </FeatureShell>
  );
}
