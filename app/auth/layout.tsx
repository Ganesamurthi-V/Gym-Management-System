import type { Metadata } from 'next'

/**
 * Metadata-only layout for `/auth/*`.
 *
 * Exists purely to declare `noindex`. Every page in this segment is a client
 * component (`'use client'`), and a client component cannot export `metadata`,
 * so the directive has to live on a server layout above them.
 *
 * `robots.ts` already disallows `/auth/`, but that only asks crawlers not to
 * fetch these URLs — a link discovered elsewhere can still appear as a bare
 * search result. `noindex` is the actual guarantee.
 *
 * It matters most for `/auth/setup-password`, which owners reach from a
 * confirmation email carrying a one-time token in the URL fragment. Login and
 * create-account are included because an indexed sign-in form has no search
 * value and competes with the real marketing surface.
 *
 * Renders `children` unchanged, so the bare-page layout these routes have always
 * had is preserved.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
