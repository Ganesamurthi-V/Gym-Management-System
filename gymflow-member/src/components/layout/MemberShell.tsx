import { BottomNav } from './BottomNav'

export function MemberShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-slate-50 pt-safe-top">
      <main className="mx-auto min-h-dvh w-full max-w-lg bg-white pb-[calc(var(--bottom-nav-height)+var(--pwa-safe-bottom)+1rem)] shadow-sm">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
