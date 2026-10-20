import { useReveal } from '../lib/useReveal';
import { sectionIds, type FeaturePage } from '../data/featurePages';
import { DocsPager } from './DocsPager';
import { DocsShell } from './DocsShell';
import { FeatureHero, FeatureShell, SectionView } from './featureParts';

/** /features: the docs home. The first section carries the card grid, the rest read as an article. */
export function FeaturesHub({ page }: { page: FeaturePage }) {
  const scope = useReveal<HTMLDivElement>({ perElement: true, y: 24, duration: 0.7, start: 'top 90%' });
  const ids = sectionIds(page);
  return (
    <FeatureShell>
      <FeatureHero page={page} />
      <div ref={scope}>
        <DocsShell page={page}>
          {page.sections.map((section, i) => (
            <SectionView key={section.heading} id={ids[i]} heading={section.heading} blocks={section.blocks} index={i} />
          ))}
          <DocsPager page={page} />
        </DocsShell>
      </div>
    </FeatureShell>
  );
}
