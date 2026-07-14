import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-white text-ink font-sans relative overflow-x-hidden">
      {children}
    </div>
  );
}
