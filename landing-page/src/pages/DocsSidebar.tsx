import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FEATURE_PAGES, docLabel, type FeaturePage } from '../data/featurePages';
import { DocsSearch } from './DocsSearch';
import '../styles/docs.css';

/** Every page, in data order, as a quiet ruled list; the current page carries a 2px blue bar. */
function PageList({ current, id }: { current: FeaturePage; id?: string }) {
  return (
    <nav id={id} aria-label="Documentation">
      <ul className="border-l border-border-subtle">
        {FEATURE_PAGES.map((page, i) => {
          const isCurrent = page.slug === current.slug;
          // A heading appears above the first page of each group (Plans, Guides).
          const heading = page.group && page.group !== FEATURE_PAGES[i - 1]?.group ? page.group : undefined;
          return (
            <li key={page.slug}>
              {heading && <p className="mb-1 mt-5 pl-4 text-[15px] text-muted-foreground">{heading}</p>}
              <a
                href={`/${page.slug}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={`doc-side-link flex min-h-11 items-center py-2 pl-4 text-[15px] leading-snug transition-colors lg:min-h-9 ${
                  isCurrent ? 'font-medium text-foreground' : 'text-foreground/75 hover:text-foreground'
                }`}
              >
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
  const navId = useId();
  return (
    <aside aria-label="Documentation sidebar" className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
      <DocsSearch />
      <div className="mt-6 max-h-[calc(100vh-14rem)] overflow-y-auto overflow-x-hidden">
        <PageList current={page} id={navId} />
      </div>
    </aside>
  );
}

/** Below lg: one disclosure that opens the search and the page list inline. */
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
    <div className="docs-mobile-menu lg:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        className="flex min-h-14 w-full items-center gap-3 border-y border-border-subtle text-left text-[16px] text-foreground transition-colors hover:text-accent-text"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-muted-foreground">Documentation menu</span>
          <span className="block truncate font-medium">{docLabel(page)}</span>
        </span>
        <ChevronDown aria-hidden className={`h-5 w-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open} className="pt-4">
        <DocsSearch onNavigate={() => setOpen(false)} />
        <div className="mt-4">
          <PageList current={page} />
        </div>
      </div>
    </div>
  );
}
