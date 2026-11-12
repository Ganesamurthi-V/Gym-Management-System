'use client'

import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}>) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-ink-950/60" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[var(--z-modal)] mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface outline-none">
          <div aria-hidden="true" className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" />
          <div className="shrink-0 px-5 pb-2 pt-3">
            <Drawer.Title className="text-lg font-semibold text-slate-900">{title}</Drawer.Title>
            <Drawer.Description className={description ? 'mt-1 text-sm text-slate-500' : 'sr-only'}>
              {description ?? title}
            </Drawer.Description>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(var(--pwa-safe-bottom,0px)+1.25rem)]">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
