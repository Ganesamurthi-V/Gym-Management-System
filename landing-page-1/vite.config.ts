import fs from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  FEATURE_CARDS,
  FEATURE_DATE_MODIFIED,
  FEATURE_FINEPRINT,
  FEATURE_OUTRO,
  FEATURE_SLUGS,
  RELATED_HEADING,
  SITE_ORIGIN,
  getFeaturePage,
  parseInline,
  sectionIds,
  type FeatureBlock,
  type FeaturePage,
} from './src/data/featurePages.ts'

// Production hosting (Cloudflare) serves public/privacy.html at /privacy, and likewise the
// built feature pages (dist/members.html at /members, ...). Vite's dev and preview servers
// do not, and answer those paths with the SPA's index.html, so the page appears to "redirect"
// to the home page. Rewrite the clean URLs to their files locally.
// The feature and guide entry files live in pages/ so the project root is not 16 HTML files. The
// dev server reads them from there; preview serves dist, where flattenPagesOutput() has already
// moved them to the root. The legal pages are plain files in public/ either way.
const LEGAL_PAGES = ['/privacy', '/terms']
const FEATURE_URLS = FEATURE_SLUGS.map(slug => `/${slug}`)
function cleanLegalUrls(): Plugin {
  const rewriter = (featureDir: string) => (req: { url?: string }, _res: unknown, next: () => void) => {
    const path = (req.url ?? '').split('?')[0]
    if (LEGAL_PAGES.includes(path)) req.url = `${path}.html`
    else if (FEATURE_URLS.includes(path)) req.url = `${featureDir}${path}.html`
    next()
  }
  return {
    name: 'clean-legal-urls',
    configureServer: server => void server.middlewares.use(rewriter('/pages')),
    configurePreviewServer: server => void server.middlewares.use(rewriter('')),
  }
}

/* ── Feature pages: head tags and no-JavaScript copy ───────────────────────────
   The feature pages are React, but a crawler that does not run JavaScript (most AI crawlers)
   only sees the HTML file. So each thin entry (members.html, ...) is filled in here, from
   src/data/featurePages.ts, with the <title>, meta tags, JSON-LD and a semantic copy of the
   page inside #root. It runs in transformIndexHtml, so dev and build produce the same thing.
   The shared head boilerplate comes from src/feature-head.html. */
const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const inlineHtml = (text: string) =>
  parseInline(text)
    .map(node => {
      if (node.kind === 'strong') return `<strong>${esc(node.text)}</strong>`
      if (node.kind === 'link') return `<a href="${esc(node.href)}">${esc(node.text)}</a>`
      return esc(node.text)
    })
    .join('')

const abs = (path: string) => (path.startsWith('http') ? path : `${SITE_ORIGIN}${path}`)

// Pages without their own card (no ogImage in the data) fall back to the homepage image.
const OG_DEFAULT = '/og-image.jpg'
const OG_ALT_DEFAULT = 'The GymFlow dashboard showing member counts, dues and expiring memberships at a glance.'

function metaTags(page: FeaturePage): string {
  const url = `${SITE_ORIGIN}/${page.slug}`
  const title = esc(page.title)
  const ogImage = abs(page.ogImage ?? OG_DEFAULT)
  const ogAlt = esc(page.ogAlt ?? OG_ALT_DEFAULT)
  const description = esc(page.description)
  // Pricing and the guides sit directly under Home; the feature pages sit under Features.
  const crumbs: { name: string; url: string }[] = [{ name: 'Home', url: `${SITE_ORIGIN}/` }]
  if (!page.topLevel) crumbs.push({ name: 'Features', url: `${SITE_ORIGIN}/features` })
  if (page.slug !== 'features') crumbs.push({ name: page.breadcrumb, url })

  // Media slots emit nothing until a file is set, so an unfilled page's markup is unchanged.
  const tutorial = page.tutorial?.src ? page.tutorial : undefined
  const firstShot = page.screenshots?.[0]

  const graph: object[] = [
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      about: { '@id': `${SITE_ORIGIN}/#software` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
      inLanguage: 'en-IN',
      dateModified: FEATURE_DATE_MODIFIED,
      ...(tutorial && { video: { '@id': `${url}#tutorial` } }),
      ...(firstShot && { primaryImageOfPage: { '@type': 'ImageObject', url: abs(firstShot.src), width: firstShot.width, height: firstShot.height } }),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: crumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    },
  ]
  if (tutorial) {
    graph.push({
      '@type': 'VideoObject',
      '@id': `${url}#tutorial`,
      name: tutorial.title,
      description: tutorial.description || tutorial.title,
      thumbnailUrl: abs(tutorial.poster),
      contentUrl: abs(tutorial.src),
      uploadDate: tutorial.uploadDate || FEATURE_DATE_MODIFIED,
      ...(tutorial.duration && { duration: tutorial.duration }),
      inLanguage: 'en-IN',
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      isPartOf: { '@id': `${url}#webpage` },
    })
  }
  if (page.slug === 'features') {
    graph.push({
      '@type': 'ItemList',
      '@id': `${url}#features`,
      name: 'GymFlow features',
      itemListElement: FEATURE_CARDS.map((card, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: card.cardTitle,
        url: `${SITE_ORIGIN}/${card.slug}`,
      })),
    })
  }
  // "<" escaped so no string in the data can ever close the script element early.
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c')

  return `<title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
    <link rel="alternate" type="text/markdown" href="/llms.txt" title="GymFlow summary for language models" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="GymFlow" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="en_IN" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${ogAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="twitter:image:alt" content="${ogAlt}" />
    <script type="application/ld+json">
${ld}
    </script>`
}

function blockHtml(block: FeatureBlock): string {
  switch (block.type) {
    case 'p':
    case 'note':
      return `<p>${inlineHtml(block.text)}</p>`
    case 'h3':
      return `<h3>${inlineHtml(block.text)}</h3>`
    case 'ul':
    case 'ol':
      return `<${block.type}>\n${block.items.map(item => `<li>${inlineHtml(item)}</li>`).join('\n')}\n</${block.type}>`
    case 'features':
      return FEATURE_CARDS.map(
        card => `<h3><a href="/${card.slug}">${esc(card.cardTitle ?? '')}</a></h3>\n<p>${esc(card.cardText ?? '')}</p>`,
      ).join('\n')
  }
}

function fallbackHtml(page: FeaturePage): string {
  const crumbs =
    page.slug === 'features'
      ? `<a href="/">Home</a> / Features`
      : page.topLevel
        ? `<a href="/">Home</a> / ${esc(page.breadcrumb)}`
        : `<a href="/">Home</a> / <a href="/features">Features</a> / ${esc(page.breadcrumb)}`
  const related = page.related
    .map(getFeaturePage)
    .filter((p): p is FeaturePage => !!p)
    .map(p => `<li><a href="/${p.slug}">${esc(p.cardTitle ?? '')}</a>: ${esc(p.cardText ?? '')}</li>`)
    .join('\n')
  const shots = page.screenshots ?? []
  const media = shots.length
    ? `<h2>See it in the app</h2>\n${shots
        .map(
          s =>
            `<figure><img src="${esc(s.src)}" alt="${esc(s.alt)}" width="${s.width}" height="${s.height}" loading="lazy" />${
              s.caption ? `<figcaption>${esc(s.caption)}</figcaption>` : ''
            }</figure>`,
        )
        .join('\n')}\n`
    : ''
  return `<main id="seo-fallback">
<nav aria-label="Breadcrumb">${crumbs}</nav>
<h1>${esc(page.h1)}</h1>
<p>${inlineHtml(page.intro)}</p>
<p><a href="https://app.gymflow.sbs">Start free trial</a> · <a href="/pricing">See pricing</a></p>
<p>${esc(FEATURE_FINEPRINT)}</p>
${page.sections
  .map((section, i) => `<h2 id="${sectionIds(page)[i]}">${esc(section.heading)}</h2>\n${section.blocks.map(blockHtml).join('\n')}`)
  .join('\n')}
${media}${related ? `<h2>${esc(RELATED_HEADING)}</h2>\n<ul>\n${related}\n</ul>` : ''}
<p>${inlineHtml(FEATURE_OUTRO)}</p>
</main>`
}

function featureHead(): Plugin {
  const shell = resolve(dirname(fileURLToPath(import.meta.url)), 'src/feature-head.html')
  return {
    name: 'feature-head',
    transformIndexHtml(html, ctx) {
      const page = getFeaturePage(basename(ctx.filename, '.html'))
      if (!page || !html.includes('<!--feature-head-->')) return html
      const head = fs.readFileSync(shell, 'utf8').replace('<!--feature-meta-->', () => metaTags(page))
      return html
        .replace('<!--feature-head-->', () => head)
        .replace('<!--feature-fallback-->', () => fallbackHtml(page))
    },
  }
}

// Vite writes an HTML entry to the same relative path it has in the project, so pages/members.html
// would land at dist/pages/members.html. The host serves dist/members.html at /members, so move
// them up once the build has written its files. Asset URLs in them are absolute, so nothing inside
// changes.
function flattenPagesOutput(): Plugin {
  let outDir = ''
  return {
    name: 'flatten-pages-output',
    apply: 'build',
    configResolved: config => void (outDir = resolve(config.root, config.build.outDir)),
    writeBundle() {
      const dir = resolve(outDir, 'pages')
      if (!fs.existsSync(dir)) return
      for (const file of fs.readdirSync(dir)) fs.renameSync(resolve(dir, file), resolve(outDir, file))
      fs.rmdirSync(dir)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cleanLegalUrls(), featureHead(), flattenPagesOutput()],
  resolve: {
    // Must mirror the "paths" entry in tsconfig.app.json. TypeScript resolves
    // @/* for the typecheck, but Vite needs its own mapping to resolve it at
    // build time — configure one without the other and `tsc -b` passes while
    // the bundle fails.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // One HTML entry per page: there is no SPA fallback on the host (wrangler.jsonc serves
    // 404.html for unknown paths), so /members must exist as dist/members.html. The entries are
    // pages/<slug>.html and flattenPagesOutput() moves them to the dist root.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        ...Object.fromEntries(
          FEATURE_SLUGS.map(slug => [slug, fileURLToPath(new URL(`./pages/${slug}.html`, import.meta.url))]),
        ),
      },
    },
  },
})
