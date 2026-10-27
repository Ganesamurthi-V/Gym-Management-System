import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { FEATURE_PAGES, docLabel, type FeaturePage } from '../data/featurePages';
import { ICONS } from './featureIcons';
import { DocsSearch } from './DocsSearch';

/** Every page, in data order: the hub first, then the seven features. */
function PageList({ current, collapsed = false, id }: { current: FeaturePage; collapsed?: boolean; id?: string }) {
  return (
    <nav id={id} aria-label="Documentation">
      <ul className="grid gap-0.5">
        {FEATURE_PAGES.map((page, i) => {
          const Icon = page.icon ? ICONS[page.icon] : LayoutGrid;
          const isCurrent = page.slug === current.slug;
          // A heading appears above the first page of each group (Plans, Guides).
          const heading = page.group && page.group !== FEATURE_PAGES[i - 1]?.group ? page.group : undefined;
          return (
            <li key={page.slug}>
              {heading &&
                (collapsed ? (
                  <hr aria-hidden className="mx-2 my-2 border-border-subtle" />
                ) : (
                  <p className="eyebrow mb-1 mt-4 px-3">{heading}</p>
                ))}
              <a
                href={`/${page.slug}`}
                aria-current={isCurrent ? 'page' : undefined}
                title={collapsed ? docLabel(page) : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-lg py-2 text-[14.5px] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-9 ${collapsed ? 'justify-center lg:min-h-11' : 'px-3'} ${
                  isCurrent
                    ? 'bg-accent-soft font-medium text-accent-text'
                    : 'text-foreground/75 hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                {/* Kept in the DOM when collapsed so screen readers still hear the page name. */}
                <span className={collapsed ? 'sr-only' : undefined}>{docLabel(page)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* No transform, overflow or contain on any ancestor of this: any of them would stop sticky from
   sticking. Only the page list scrolls, so the search dropdown is never clipped. Collapsed is an
   explicit toggle (no hover-expand): the sidebar sits beside the text, so a rail that grew on
   hover would cover it. */
export function DocsSidebar({
  page,
  collapsed,
  onToggle,
  onExpand,
}: {
  page: FeaturePage;
  collapsed: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const navId = useId();
  // Set when the search icon or `/` expands the rail, so the box that mounts next takes focus.
  const [focusSearch, setFocusSearch] = useState(false);
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? 'Expand documentation sidebar' : 'Collapse documentation sidebar';

  useEffect(() => {
    if (!collapsed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!window.matchMedia('(min-width: 1024px)').matches) return;
      e.preventDefault();
      setFocusSearch(true);
      onExpand();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, onExpand]);

  const btn =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <aside aria-label="Documentation sidebar" className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
      <div className={`mb-3 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <p className="eyebrow pl-1">Documentation</p>}
        <button type="button" aria-label={label} title={label} aria-expanded={!collapsed} aria-controls={navId} onClick={onToggle} className={btn}>
          <Toggle aria-hidden className="h-5 w-5" />
        </button>
      </div>
      {collapsed ? (
        <button
          type="button"
          aria-label="Search the documentation"
          title="Search docs"
          onClick={() => {
            setFocusSearch(true);
            onExpand();
          }}
          className={`${btn} mx-auto`}
        >
          <Search aria-hidden className="h-5 w-5" />
        </button>
      ) : (
        <DocsSearch focusOnMount={focusSearch} />
      )}
      <div className="mt-4 max-h-[calc(100vh-17rem)] overflow-y-auto overflow-x-hidden">
        <PageList current={page} collapsed={collapsed} id={navId} />
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
    <div className="docs-mobile-menu lg:hidden">
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
