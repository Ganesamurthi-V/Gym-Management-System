import type { Metadata } from 'next'

/**
 * Metadata-only layout for `/activate/*`.
 *
 * This is the segment where `noindex` genuinely earns its place. These pages are
 * reachable with no session at all — a member opens them straight from WhatsApp
 * or from the activation email — and two of them carry single-use credentials in
 * the URL:
 *
 *     /activate/<invitation-token>
 *     /activate/verifying#token_hash=…&type=magiclink
 *
 * `robots.ts` disallows `/activate/`, which stops well-behaved crawlers fetching
 * them, but a disallowed URL can still be listed if it is discovered through an
 * external link. `noindex` is what actually keeps it out of the index.
 *
 * Declared here rather than on the pages because `/activate/verifying` and
 * `/activate/error` are client components and cannot export `metadata`.
 *
 * Renders `children` unchanged.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function ActivateLayout({ children }: { children: React.ReactNode }) {
  return children
}
