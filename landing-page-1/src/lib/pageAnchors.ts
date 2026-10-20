/* The homepage is one long page with sections to scroll to; the feature pages (/features,
   /members, ...) are separate HTML files with no such sections. The shared Navbar, Footer
   and CTA keep their in-page links as plain "#pricing" for the homepage, and use these two
   helpers to turn them into "/#pricing" anywhere else, which loads the homepage and lets
   App.tsx scroll to the section once it has mounted.

   The marker is data-page on #root, written into each feature page's HTML (see the
   feature-*.html entries and feature-main.tsx). index.html has none. */
export function isFeaturePage(): boolean {
  return document.getElementById('root')?.dataset.page !== undefined;
}

/** "#pricing" on the homepage, "/#pricing" on a feature page. "#" alone means the top: "/". */
export function homeAnchor(hash: string): string {
  if (!isFeaturePage()) return hash;
  return hash === '#' ? '/' : `/${hash}`;
}
