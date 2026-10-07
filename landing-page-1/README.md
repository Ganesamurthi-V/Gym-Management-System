# GymFlow marketing site

The public landing page (the hosted one is [www.gymflow.sbs](https://www.gymflow.sbs)). A
single-page static site: Vite, React 19, Tailwind 4, GSAP and Lenis. It has no backend and
needs no environment variables to run.

## Run it

```bash
cd landing-page-1
npm install
npm run dev          # Vite dev server, prints the URL
```

Checks before pushing:

```bash
npx tsc -b
npm run lint         # oxlint
npm run build        # outputs dist/
npm run preview      # serves dist/ locally
```

## Layout

```
landing-page-1/
├── index.html            # <head>: SEO meta, JSON-LD, the no-JavaScript copy of the page
├── src/
│   ├── App.tsx           # Hero loads first; everything below the fold is a lazy chunk
│   ├── BelowFold.tsx     # The sections under the hero
│   ├── components/       # One file per section, plus the cookie banner
│   └── lib/analytics.ts  # Consent-gated Microsoft Clarity and Google Analytics
├── public/
│   ├── privacy.html, terms.html, 404.html
│   ├── robots.txt, sitemap.xml, llms.txt
│   └── video/, images, favicons
├── vercel.json           # Used if you host on Vercel
└── wrangler.jsonc        # Used if you host on Cloudflare Workers (the hosted site does)
```

## Things worth knowing

- **Performance is deliberate.** Fonts load without blocking, the sections below the hero are a
  separate chunk loaded after first paint, and the hero's WebGL background (three.js) is
  lazy-loaded behind connection and device checks. Measure with Lighthouse on mobile before and
  after any change to the hero or to `App.tsx`.
- **`index.html` contains a static copy of the page** inside `#root`, for crawlers that do not
  run JavaScript. It is hidden as soon as scripts run. If you change the copy in a component,
  change it there and in the JSON-LD too.
- **`/privacy` and `/terms` are plain HTML files** in `public/`. The Vite dev and preview
  servers rewrite those two clean URLs to the files (see `vite.config.ts`); in production the
  host does it.
- **Analytics are off until the visitor allows them.** The cookie banner
  (`src/components/CookieBanner.tsx`) stores a choice per tool. Clarity loads only after
  consent. Google Analytics is loaded in Consent Mode with storage denied, then granted.

## Making it yours

The content is specific to gymflow.sbs. Before deploying a fork:

| What | Where |
|---|---|
| Link to the app (`https://app.gymflow.sbs`) | the `APP_URL` constant at the top of several files in `src/components/` |
| Support email, phone and WhatsApp number | `src/components/Footer.tsx` |
| Prices and plan copy | `src/components/Pricing.tsx`, `FAQ.tsx` |
| Title, description, canonical URL, JSON-LD, the no-JS copy | `index.html` |
| Google Analytics ID and the hostname it is limited to | the last `<script>` in the `<head>` of `index.html` |
| Microsoft Clarity project | `VITE_CLARITY_PROJECT_ID` (see `.env.example`) |
| Legal pages | `public/privacy.html`, `public/terms.html`: these describe GymFlow's own practices, so rewrite them for yours |
| Domain in `robots.txt`, `sitemap.xml`, `llms.txt` | `public/` |
| Apex → www redirect | `vercel.json`, or a redirect rule on your host |
| Logo, favicons, video, social image | `public/` |

The Google Analytics tag only runs when the page is served from `gymflow.sbs`, so an unchanged
fork does not report to the original property.

## Deploying

`npm run build` produces a static `dist/` folder that any static host can serve. Two things
the host must do:

- serve `public/404.html` with a real 404 status for unknown paths (on Cloudflare Workers that
  is `not_found_handling: "404-page"` in `wrangler.jsonc`), and
- serve `privacy.html` at `/privacy` and `terms.html` at `/terms`.

## License

[GNU AGPL v3.0](../LICENSE), the same as the rest of the repository. The GymFlow name, logo and
the launch video are the original project's brand; please use your own for a service you run.
