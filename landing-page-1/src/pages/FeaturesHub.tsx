import { useReveal } from '../lib/useReveal';
import type { FeaturePage } from '../data/featurePages';
import { FeatureGrid, FeatureHero, FeatureShell, SectionView } from './featureParts';

/** /features: the grid of every feature page, then the general sections below it. */
export function FeaturesHub({ page }: { page: FeaturePage }) {
  // The first section is the grid of cards; the rest read as an article.
  const [grid, ...rest] = page.sections;

  const scope = useReveal<HTMLDivElement>({ perElement: true, y: 36, duration: 0.8, start: 'top 88%' });
  return (
    <FeatureShell>
      <FeatureHero page={page} />
      <div ref={scope}>
        <section aria-labelledby="hub-grid-title" className="contain-visible px-5 py-6 md:px-8 md:py-10">
          <div className="mx-auto w-full max-w-[1240px]">
            <div className="reveal flex flex-col items-center text-center">
              <span className="eyebrow">01</span>
              <h2 id="hub-grid-title" className="display-3 mt-3 text-balance">
                {grid.heading}
              </h2>
              <span aria-hidden className="mt-5 h-1 w-12 rounded-full bg-accent" />
            </div>
            {/* The grid is this section's only block. */}
            <FeatureGrid />
          </div>
        </section>
        <section className="contain-visible px-5 py-10 md:px-8 md:py-14">
          <div className="mx-auto max-w-[1240px]">
            {rest.map((section, i) => (
              <SectionView key={section.heading} heading={section.heading} blocks={section.blocks} index={i + 1} />
            ))}
          </div>
        </section>
      </div>
    </FeatureShell>
  );
}
