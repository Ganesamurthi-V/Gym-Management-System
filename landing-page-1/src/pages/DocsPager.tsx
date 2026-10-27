import { ArrowLeft, ArrowRight, LayoutGrid } from 'lucide-react';
import { FEATURE_PAGES, docLabel, type FeaturePage } from '../data/featurePages';
import { ICONS } from './featureIcons';

function PagerLink({ target, dir }: { target: FeaturePage; dir: 'prev' | 'next' }) {
  const Icon = target.icon ? ICONS[target.icon] : LayoutGrid;
  const Arrow = dir === 'prev' ? ArrowLeft : ArrowRight;
  return (
    <a
      href={`/${target.slug}`}
      rel={dir}
      className={`group flex min-h-16 items-center gap-3 rounded-xl border border-border-subtle bg-frame p-4 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        dir === 'next' ? 'flex-row-reverse text-right sm:col-start-2' : ''
      }`}
    >
      <Arrow aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-text" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-muted-foreground">
          {dir === 'prev' ? 'Previous' : 'Next'}
        </span>
        <span className={`mt-0.5 flex items-center gap-2 text-[15px] font-medium text-foreground group-hover:text-accent-text ${dir === 'next' ? 'flex-row-reverse' : ''}`}>
          <Icon aria-hidden className="h-4 w-4 shrink-0 text-accent-text" />
          <span className="min-w-0">{docLabel(target)}</span>
        </span>
      </span>
    </a>
  );
}

/** Previous / Next in sidebar order. Next always sits in the right column, so an empty Previous slot keeps the layout. */
export function DocsPager({ page }: { page: FeaturePage }) {
  const i = FEATURE_PAGES.findIndex(p => p.slug === page.slug);
  const prev = FEATURE_PAGES[i - 1];
  const next = FEATURE_PAGES[i + 1];
  return (
    <nav aria-label="Previous and next article" className="mt-12 grid gap-3 sm:grid-cols-2">
      {prev && <PagerLink target={prev} dir="prev" />}
      {next && <PagerLink target={next} dir="next" />}
    </nav>
  );
}
