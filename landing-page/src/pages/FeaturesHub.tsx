import type { FeaturePage } from '../data/featurePages';
import { ArticleBody, ArticleFooter, ArticleHeader, FeatureShell, PageIndex } from './featureParts';

/**
 * /features: a clean index. The data's first section is the list of features, drawn here as a filterable card
 * grid; the remaining sections read as an ordinary article beneath it.
 */
export function FeaturesHub({ page }: { page: FeaturePage }) {
  const [index, ...rest] = page.sections;
  return (
    <FeatureShell>
      <ArticleHeader page={page} />
      <div className="px-5 pt-8 md:px-8 md:pt-10">
        <div className="mx-auto max-w-[1200px] border-t border-border-subtle pt-8 md:pt-10">
          <PageIndex id="what-gymflow-does" heading={index.heading} />
        </div>
      </div>
      <ArticleBody page={page} sections={rest} />
      <ArticleFooter page={page} />
    </FeatureShell>
  );
}
