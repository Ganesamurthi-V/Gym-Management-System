import { useReveal } from '../lib/useReveal';
import type { FeaturePage as FeaturePageData } from '../data/featurePages';
import { FeatureHero, FeatureShell, RelatedFeatures, ScreenshotsSection, SectionView, TutorialSection } from './featureParts';

/** A page under /features: hero, the page's illustration above its sections, related pages. */
export function FeaturePage({ page }: { page: FeaturePageData }) {
  const scope = useReveal<HTMLDivElement>({ perElement: true, y: 36, duration: 0.8, start: 'top 88%' });
  return (
    <FeatureShell>
      <FeatureHero page={page} />
      <div ref={scope}>
        {/* contain-visible: the BorderGlow halo paints outside its card and the default paint
            containment on a section would clip it. */}
        <section className="contain-visible px-5 py-6 md:px-8 md:py-10">
          {/* One column across the full 1240px content column, like a document. */}
          <div className="mx-auto flex max-w-[1240px] flex-col gap-12">
            <TutorialSection page={page} />
            <div className="min-w-0">
              {page.sections.map((section, i) => (
                <SectionView key={section.heading} heading={section.heading} blocks={section.blocks} index={i} />
              ))}
            </div>
            <ScreenshotsSection page={page} />
          </div>
        </section>
        <RelatedFeatures page={page} />
      </div>
    </FeatureShell>
  );
}
