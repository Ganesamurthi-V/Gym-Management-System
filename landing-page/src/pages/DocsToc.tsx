import { useEffect, useState } from 'react';

export interface TocItem {
  id: string;
  label: string;
}

/** "On this page" (xl and up): links to each section with the one in view highlighted. */
export function DocsToc({ items }: { items: TocItem[] }) {
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
    <aside aria-label="On this page" className="hidden xl:sticky xl:top-28 xl:block xl:self-start">
      <p className="eyebrow mb-3">On this page</p>
      <ul className="grid gap-0.5 border-l border-border-subtle">
        {items.map(item => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? 'location' : undefined}
              className={`-ml-px block border-l-2 py-1.5 pl-3 text-[13.5px] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active === item.id
                  ? 'border-accent font-medium text-accent-text'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
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
