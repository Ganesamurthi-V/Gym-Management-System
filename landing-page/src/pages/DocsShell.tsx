import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { sectionIds, type FeaturePage } from '../data/featurePages';
import { DocsMobileMenu, DocsSidebar } from './DocsSidebar';
import { DocsToc } from './DocsToc';
import { Breadcrumb } from './featureParts';

const COLLAPSE_KEY = 'gf-docs-sidebar-collapsed';

/**
 * The documentation frame under the hero: sidebar | content | "on this page". The content
 * column is min-w-0 so a long word or wide figure cannot push the grid past the viewport.
 */
export function DocsShell({ page, children }: { page: FeaturePage; children: ReactNode }) {
  const ids = sectionIds(page);
  // Read synchronously so the first paint already has the stored state (pages render after the
  // static fallback, so there is no server markup to mismatch). Blocked storage means expanded.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const setSidebar = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, String(next));
    } catch {
      /* storage blocked: the choice just does not persist */
    }
  }, []);
  const onExpand = useCallback(() => setSidebar(false), [setSidebar]);
  // The page is rendered by React after load, so the browser's own jump to /slug#section finds
  // nothing (the static copy is display:none). Jump once the sections exist, and again after the
  // web fonts have shifted the layout.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const jump = () => document.getElementById(id)?.scrollIntoView();
    const frame = requestAnimationFrame(jump);
    const later = window.setTimeout(jump, 700);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
    };
  }, []);
  const toc = page.sections.map((s, i) => ({ id: ids[i], label: s.heading }));
  return (
    <div className="px-5 pb-8 pt-[88px] md:px-8 md:pb-10 md:pt-[92px]">
      <div className="mx-auto max-w-[1240px]">
        <Breadcrumb page={page} />
        <DocsMobileMenu page={page} />
        <div
          className={`mt-6 grid gap-8 transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none lg:mt-0 ${
            collapsed
              ? 'lg:grid-cols-[64px_minmax(0,1fr)] xl:grid-cols-[64px_minmax(0,1fr)_200px]'
              : 'lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_200px]'
          }`}
        >
          <DocsSidebar page={page} collapsed={collapsed} onToggle={() => setSidebar(!collapsed)} onExpand={onExpand} />
          <div className={`min-w-0 ${collapsed ? 'max-w-[920px]' : 'max-w-[860px]'}`}>{children}</div>
          <DocsToc items={toc} />
        </div>
      </div>
    </div>
  );
}
