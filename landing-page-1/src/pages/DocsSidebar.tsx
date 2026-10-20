import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, Menu } from 'lucide-react';
import { FEATURE_PAGES, docLabel, type FeaturePage } from '../data/featurePages';
import { ICONS } from './featureIcons';
import { DocsSearch } from './DocsSearch';

/** Every page, in data order: the hub first, then the seven features. */
function PageList({ current }: { current: FeaturePage }) {
  return (
    <nav aria-label="Documentation">
      <ul className="grid gap-0.5">
        {FEATURE_PAGES.map(page => {
          const Icon = page.icon ? ICONS[page.icon] : LayoutGrid;
          const isCurrent = page.slug === current.slug;
          return (
            <li key={page.slug}>
              <a
                href={`/${page.slug}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-[14.5px] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-9 ${
                  isCurrent
                    ? 'bg-accent-soft font-medium text-accent-text'
                    : 'text-foreground/75 hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                {docLabel(page)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* No transform, overflow or contain on any ancestor of this: any of them would stop sticky from
   sticking. Only the page list scrolls, so the search dropdown is never clipped. */
export function DocsSidebar({ page }: { page: FeaturePage }) {
  return (
    <aside aria-label="Documentation sidebar" className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
      <p className="eyebrow mb-3">Documentation</p>
      <DocsSearch />
      <div className="mt-4 max-h-[calc(100vh-17rem)] overflow-y-auto">
        <PageList current={page} />
      </div>
    </aside>
  );
}

/** Below lg: one full-width bar that opens the search and the page list inline. */
export function DocsMobileMenu({ page }: { page: FeaturePage }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 text-left text-[15px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Menu aria-hidden className="h-4 w-4 shrink-0 text-accent-text" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Documentation menu</span>
          <span className="block truncate font-medium">{docLabel(page)}</span>
        </span>
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open} className="mt-2 rounded-xl border border-border-subtle bg-surface p-3">
        <DocsSearch onNavigate={() => setOpen(false)} />
        <div className="mt-3">
          <PageList current={page} />
        </div>
      </div>
    </div>
  );
}
