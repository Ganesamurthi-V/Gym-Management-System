import { useEffect, type ReactNode } from 'react';
import { sectionIds, type FeaturePage } from '../data/featurePages';
import { DocsMobileMenu, DocsSidebar } from './DocsSidebar';
import { DocsToc, TocDisclosure } from './DocsToc';
import '../styles/docs.css';

/**
 * The reading frame for the guides, under the page head: sidebar | article at 65ch | "on this page". The
 * article column is min-w-0 so a long word or wide figure cannot push the grid past the viewport.
 */
export function DocsShell({ page, children }: { page: FeaturePage; children: ReactNode }) {
  const ids = sectionIds(page);
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
    <div className="px-5 pb-16 md:px-8 md:pb-24">
      <div className="mx-auto max-w-[1200px]">
        <DocsMobileMenu page={page} />
        <div className="mt-4 lg:mt-0 xl:hidden">
          <TocDisclosure items={toc} />
        </div>
        <div className="mt-6 grid gap-10 lg:mt-0 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_200px] xl:gap-14">
          <DocsSidebar page={page} />
          <div className="min-w-0">
            <div className="mx-auto max-w-[65ch]">{children}</div>
          </div>
          <DocsToc items={toc} />
        </div>
      </div>
    </div>
  );
}
