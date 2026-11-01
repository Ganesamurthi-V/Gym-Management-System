import type { FeaturePage } from '../data/featurePages';
import { DocsPager } from './DocsPager';
import { FeatureHead, FeatureSections, FeatureShell, MoreFromGymFlow } from './featureParts';

/** /features: the docs home. The first section is the ruled list of features, the rest are composed like any page. */
export function FeaturesHub({ page }: { page: FeaturePage }) {
  return (
    <FeatureShell>
      <FeatureHead page={page} search />
      <FeatureSections page={page} />
      <div className="px-5 pb-16 md:px-8 md:pb-24">
        <div className="mx-auto max-w-[1200px]">
          <DocsPager page={page} />
        </div>
      </div>
      <MoreFromGymFlow page={page} />
    </FeatureShell>
  );
}
