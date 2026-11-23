# GymFlow marketing site

The public landing page, hosted at [www.thegymflow.in](https://www.thegymflow.in). It is a static
site built with Vite, React 19, Tailwind 4, GSAP and Lenis. It has no backend and needs no
environment variables to run.

## What you need

- Node.js and npm.

## Run it

```bash
cd landing-page
npm install
npm run dev          # Vite dev server, prints the URL
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Runs `check:copy` and `tsc -b`, then `vite build`. Output goes to `dist/` |
| `npm run preview` | Serves `dist/` locally |
| `npm run lint` | oxlint |
| `npm run check:copy` | Fails if the prices in `src/data/plans.ts` are missing from `index.html` or `public/llms.txt` |
| `npm run indexnow` | Tells Bing and other IndexNow engines which URLs changed. Run it after a deploy is live |

Before you push, run `npx tsc -b`, `npm run lint` and `npm run build`.

## Environment variables

None are required. `.env.example` has one optional variable:

| Variable | What it does |
|---|---|
| `VITE_CLARITY_PROJECT_ID` | Microsoft Clarity project ID. Leave it blank to turn Clarity off. |

Vite bakes `VITE_*` values into the bundle at **build** time, so set them as build variables on your
host. They are public. Never put a secret here.

Google Analytics is not configured with a variable. See "Make it yours" below.

## Project layout

```
landing-page/
├── index.html            # <head>: SEO meta, JSON-LD, the no-JavaScript copy of the page
├── pages/                # One thin HTML entry per feature page and guide (members.html, ...);
│                         #   built to dist/<name>.html. Content lives in src/data/featurePages.ts
├── scripts/              # check-copy-sync.mjs (build check), indexnow.mjs
├── src/
│   ├── App.tsx           # Hero loads first; everything below the fold is a lazy chunk
│   ├── BelowFold.tsx     # The sections under the hero
│   ├── components/       # One file per section, plus the cookie banner
│   ├── data/             # featurePages.ts (every feature page and guide), plans.ts, support.ts
│   ├── pages/            # React for the feature pages and guides (docs layout)
│   └── lib/analytics.ts  # Consent-gated Microsoft Clarity and Google Analytics
├── public/
│   ├── privacy.html, terms.html, 404.html
│   ├── robots.txt, sitemap.xml, llms.txt
│   ├── og/               # Social preview images
│   └── video/, images, favicons
├── vercel.json           # Used if you host on Vercel
└── wrangler.jsonc        # Used if you host on Cloudflare Workers (the hosted site does)
```

## Things worth knowing

- **Performance is deliberate.** Fonts load without blocking. The sections below the hero are a
  separate chunk loaded after first paint. The hero's WebGL background (three.js) is lazy-loaded
  behind connection and device checks. Measure with Lighthouse on mobile before and after any
  change to the hero or to `App.tsx`.
- **`index.html` contains a static copy of the page** inside `#root`, for crawlers that do not run
  JavaScript. It is hidden as soon as scripts run. If you change the copy in a component, change it
  there and in the JSON-LD too.
- **`/privacy` and `/terms` are plain HTML files** in `public/`. The Vite dev and preview servers
  rewrite those two clean URLs to the files (see `vite.config.ts`). In production the host does it.
- **Analytics are off until the visitor allows them.** The cookie banner
  (`src/components/CookieBanner.tsx`) stores a choice per tool. Clarity loads only after consent.
  Google Analytics loads in Consent Mode with storage denied, then granted.

## Make it yours

The content is specific to thegymflow.in. Before you deploy a fork, change these:

| What | Where |
|---|---|
| Link to the app (`https://app.thegymflow.in`) | The `APP_URL` constant at the top of several files in `src/components/` and `src/pages/featureParts.tsx` (search for `APP_URL`) |
| Support email, phone and WhatsApp number | `src/data/support.ts` |
| Prices and plan copy | `src/data/plans.ts`, `src/components/Pricing.tsx`, `src/components/FAQ.tsx` |
| Title, description, canonical URL, JSON-LD, the no-JS copy | `index.html` |
| Google Analytics ID and the hostname it is limited to | The last `<script>` in the `<head>` of `index.html` |
| Microsoft Clarity project | `VITE_CLARITY_PROJECT_ID` |
| Legal pages | `public/privacy.html`, `public/terms.html`. They describe GymFlow's own practices, so rewrite them for yours. |
| Domain in `robots.txt`, `sitemap.xml`, `llms.txt` | `public/` |
| Domain in the IndexNow script | `HOST` and `KEY` in `scripts/indexnow.mjs`, and the key file in `public/` |
| Apex to www redirect | `vercel.json`, or a redirect rule on your host |
| Logo, favicons, video, social images | `public/` |

The Google Analytics tag only runs when the page is served from the hostname in that script (the
project's own production hostname). An unchanged fork does not report to the original property.

## Deploy

`npm run build` produces a static `dist/` folder that any static host can serve. The hosted site
uses Cloudflare Workers static assets, configured in `wrangler.jsonc`. The host must do two things:

- Serve `public/404.html` with a real 404 status for unknown paths. On Cloudflare Workers that is
  `not_found_handling: "404-page"` in `wrangler.jsonc`.
- Serve `privacy.html` at `/privacy` and `terms.html` at `/terms`.

After a deploy goes live, you can run `npm run indexnow`.

## Keep llms.txt in sync

`public/llms.txt`, the rendered pages and the JSON-LD graph in `index.html` make the same claims in
three formats. If you change a figure in one and not the others, a language model may quote a
price the site no longer charges. The build's copy check (`scripts/check-copy-sync.mjs`) fails when
the prices in `src/data/plans.ts` are missing from `index.html` or `llms.txt`.

- Bump "Last updated" in `llms.txt` together with `lastmod` in `public/sitemap.xml`.
- When you add a feature page:
  1. Add it to `src/data/featurePages.ts`. The build entries and the dev clean-URL rewrites come
     from the slugs there.
  2. Add a `pages/<slug>.html`, copied from `pages/members.html`, with its own `data-page`.
  3. Add a social card in `public/og/`.
  4. Add it to the feature-pages list in `llms.txt` and to `public/sitemap.xml`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm run build` fails in `check:copy` | A price in `src/data/plans.ts` is missing from `index.html` or `public/llms.txt`. Update them together. |
| Clarity does not load | It loads only in production builds, only after consent, and only if `VITE_CLARITY_PROJECT_ID` was set at build time. |
| Unknown URLs return 200 | Your host serves `index.html` for everything. Turn on a real 404 page (see "Deploy"). |
| `/privacy` or `/terms` shows a 404 | Your host does not map clean URLs to `privacy.html` and `terms.html`. |

## License

[GNU AGPL v3.0](../LICENSE), the same as the rest of the repository. The GymFlow name, logo and the
launch video are the original project's brand. Please use your own for a service you run.
