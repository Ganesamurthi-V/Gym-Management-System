import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import '../styles/docs.css';
import '../styles/feature.css';

export interface TocItem {
  id: string;
  label: string;
}

/** "On this page" (from lg or xl up): small sentence-case links, the one in view marked with the 2px blue bar. */
export function DocsToc({ items, from = 'xl' }: { items: TocItem[]; from?: 'lg' | 'xl' }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map(i => document.getElementById(i.id)).filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const visible = new Set<string>();
    // A band just under the navbar: the first section touching it (in page order) is the current one.
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = els.find(el => visible.has(el.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-120px 0px -60% 0px' }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  if (items.length < 2) return null;
  return (
    <aside aria-label="On this page" className={from === 'lg' ? 'hidden lg:sticky lg:top-28 lg:block lg:self-start' : 'hidden xl:sticky xl:top-28 xl:block xl:self-start'}>
      <p className="mb-3 text-[15px] text-muted-foreground">On this page</p>
      <ul className="border-l border-border-subtle">
        {items.map(item => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? 'location' : undefined}
              className={`doc-side-link block py-1.5 pl-4 text-[15px] leading-snug transition-colors ${
                active === item.id ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Under xl the same anchors sit in a disclosure above the body. */
export function TocDisclosure({ items, below = 'xl' }: { items: TocItem[]; below?: 'lg' | 'xl' }) {
  if (items.length < 2) return null;
  return (
    <details className={`faq-item border-y border-border-subtle ${below === 'lg' ? 'lg:hidden' : 'xl:hidden'}`}>
      <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 text-[16px] font-medium text-foreground">
        On this page
        <ChevronDown aria-hidden className="faq-chev h-5 w-5 shrink-0 text-muted-foreground" />
      </summary>
      <ul className="pb-4">
        {items.map(item => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="block min-h-11 py-2 text-[16px] text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
