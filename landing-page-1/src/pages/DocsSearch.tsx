import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchDocs } from '../lib/docsSearch';

/**
 * Documentation search box with a results list (combobox + listbox). `/` focuses the visible
 * box when the visitor is not typing elsewhere. Results are real links to /slug#section-id.
 */
export function DocsSearch({ onNavigate }: { onNavigate?: () => void }) {
  const id = useId();
  const listId = `${id}-results`;
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchDocs(query), [query]);
  const showList = open && query.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Two boxes exist (sidebar and mobile menu); only the one that is on screen takes the key.
      if (!input.current || input.current.offsetParent === null) return;
      e.preventDefault();
      input.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (i: number) => {
    const r = results[i];
    if (!r) return;
    onNavigate?.();
    setOpen(false);
    window.location.href = `/${r.slug}#${r.id}`;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(a => (a + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (showList && results.length > 0) {
        e.preventDefault();
        go(active);
      }
    } else if (e.key === 'Escape') {
      if (showList) e.stopPropagation();
      setOpen(false);
      if (!showList) setQuery('');
    }
  };

  return (
    <div role="search" className="relative">
      <label htmlFor={`${id}-input`} className="sr-only">
        Search the documentation
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={input}
          id={`${id}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results.length > 0 ? `${id}-opt-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search docs"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={e => {
            // Clicking a result must not close the list before the click lands.
            if (!e.relatedTarget || !e.currentTarget.closest('[role=search]')?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-xl border border-border-subtle bg-surface pl-9 pr-9 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border-subtle px-1.5 font-mono text-[11px] text-muted-foreground lg:block"
        >
          /
        </kbd>
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border-subtle bg-surface p-1.5 shadow-lg lg:absolute lg:left-0 lg:top-full lg:z-30 lg:w-[380px]"
        >
          {results.length === 0 && (
            <li role="option" aria-selected="false" aria-disabled="true" className="px-3 py-3 text-[14px] text-muted-foreground">
              No results
            </li>
          )}
          {results.map((r, i) => (
            <li key={`${r.slug}#${r.id}`} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
              <a
                href={`/${r.slug}#${r.id}`}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  onNavigate?.();
                  setOpen(false);
                }}
                className={`block rounded-lg px-3 py-2.5 ${i === active ? 'bg-accent-soft' : ''}`}
              >
                <span className="block text-[12px] font-medium uppercase tracking-wide text-accent-text">{r.pageLabel}</span>
                <span className="mt-0.5 block text-[15px] font-medium text-foreground">{r.heading}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                  {r.snippet.map((part, k) =>
                    part.hit ? (
                      <mark key={k} className="rounded-sm bg-accent-soft px-0.5 text-foreground">
                        {part.text}
                      </mark>
                    ) : (
                      part.text
                    )
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
