import { sectionIds, type FeaturePage } from '../data/featurePages';
import { DocsPager } from './DocsPager';
import { DocsShell } from './DocsShell';
import { FeatureTitle, FeatureShell, SectionView } from './featureParts';

/** /features: the docs home. The first section carries the card grid, the rest read as an article. */
export function FeaturesHub({ page }: { page: FeaturePage }) {
  const ids = sectionIds(page);
  return (
    <FeatureShell>
      <div>
        <DocsShell page={page}>
          <FeatureTitle page={page} />
          {page.sections.map((section, i) => (
            <SectionView key={section.heading} id={ids[i]} heading={section.heading} blocks={section.blocks} index={i} />
          ))}
          <DocsPager page={page} />
        </DocsShell>
      </div>
    </FeatureShell>
  );
}
