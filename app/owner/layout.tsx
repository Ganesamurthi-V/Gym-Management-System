import type { Metadata } from 'next'
import { SmoothScrollProvider } from '@/components/providers/SmoothScrollProvider'
import AppShell from '@/components/layout/AppShell'

/**
 * Owner console layout.
 *
 * Everything that used to live in the root layout (SmoothScrollProvider +
 * AppShell, which owns the sidebar, header, trial banner and the subscription
 * paywall) moved here during the unified-app migration. The root layout is now
 * shell-less so `/m/*`, `/auth/*` and `/activate/*` are not wrapped in owner
 * chrome.
 *
 * `manifest` is declared per-subtree so installing the PWA from an owner page
 * yields the owner app (start_url `/owner/dashboard`), while installing from a
 * member page yields the member app. Nested metadata overrides the root value.
 */
export const metadata: Metadata = {
  title: {
    default: 'gymflow — Gym Management',
    template: '%s — gymflow',
  },
  manifest: '/manifest-owner.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'gymflow',
  },
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScrollProvider>
      <AppShell>{children}</AppShell>
    </SmoothScrollProvider>
  )
}
