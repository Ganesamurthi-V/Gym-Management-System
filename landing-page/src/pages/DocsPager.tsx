import { FEATURE_PAGES, docLabel, type FeaturePage } from '../data/featurePages';
import '../styles/feature.css';

function PagerLink({ target, dir }: { target: FeaturePage; dir: 'prev' | 'next' }) {
  return (
    <a
      href={`/${target.slug}`}
      rel={dir}
      className={`block min-h-16 py-2 ${dir === 'next' ? 'text-right sm:col-start-2' : ''}`}
    >
      <span className="block text-[16px] text-muted-foreground">{dir === 'prev' ? 'Previous' : 'Next'}</span>
      <span className="display-3 mt-1 block text-foreground">
        <span className="link-grow">{docLabel(target)}</span>
      </span>
    </a>
  );
}

/** Previous / Next in sidebar order, two plain large links. Next always sits in the right column. */
export function DocsPager({ page }: { page: FeaturePage }) {
  const i = FEATURE_PAGES.findIndex(p => p.slug === page.slug);
  const prev = FEATURE_PAGES[i - 1];
  const next = FEATURE_PAGES[i + 1];
  return (
    <nav aria-label="Previous and next article" className="mt-16 grid gap-6 border-t border-border-subtle pt-8 sm:grid-cols-2">
      {prev && <PagerLink target={prev} dir="prev" />}
      {next && <PagerLink target={next} dir="next" />}
    </nav>
  );
}
