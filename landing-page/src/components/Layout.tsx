import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  // overflow-x-clip, not -hidden: hidden turns this wrapper into a scroll container,
  // and position: sticky then sticks to it instead of the viewport — which is to say
  // not at all. clip cuts the same horizontal overflow without that side effect.
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background font-sans text-foreground">
      {/*
        Skip link. Visually hidden until focused, then pinned top-left — a
        keyboard visitor should not have to tab through the whole header and its
        dropdowns to reach the page content.
      */}
      <a
        href="#main-content"
        className="sr-only rounded-pill focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-foreground focus:px-5 focus:py-2.5 focus:text-sm focus:font-medium focus:text-background"
      >
        Skip to main content
      </a>
      {children}
    </div>
  );
}
