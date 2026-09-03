# Original raster sources

Full-resolution originals for the images the landing page ships as WebP.

They live here rather than in `public/` on purpose. Vite copies **everything** in
`public/` into `dist/` verbatim, so leaving them there shipped 2,235 KB of files
no browser ever requested — the components reference only the `.webp` versions.
Nothing imports this folder, so Vite leaves it out of the bundle entirely.

Keep them: they are the only lossless source if an image needs re-encoding at a
different size, and re-encoding an already-lossy WebP compounds artefacts.

## What ships, and why each size

| Original                        | Shipped as (`public/`)           | Rendered at        | Target width |
| ------------------------------- | -------------------------------- | ------------------ | ------------ |
| `Whatsapp_phone.png` 1024x1536  | `Whatsapp_phone.webp` 880x1320   | 440 CSS px cap     | 2x = 880     |
| `hero.png` 2880x1532            | `hero.webp` 1160x617             | 580 CSS px cap     | 2x = 1160    |
| `logo_landspace_without_bg.png` | `...without_bg.webp` 400x178     | 80 CSS px tall max | 400          |
| `logo_only.png` 160x160         | `logo_only.webp` 160x160         | 20 and 12 CSS px   | native       |

The CSS caps come from the components: `max-w-[440px]` on the phone wrapper in
`WhatsAppSection.tsx`, and `max-w-[540px] xl:max-w-[580px]` on the mockup card in
`Hero.tsx`. If either container is widened, bump the corresponding WebP or it
will look soft on retina screens.

## Regenerating

Requires `sharp`, which the root project already depends on (the landing page
does not). From the repo root:

```js
import sharp from 'sharp'

await sharp('landing-page/src/assets/originals/Whatsapp_phone.png')
  .resize({ width: 880, withoutEnlargement: true, fit: 'inside' })
  .webp({ quality: 80, effort: 6, alphaQuality: 100 })
  .toFile('landing-page/public/Whatsapp_phone.webp')
```

`alphaQuality: 100` matters — all of these except `hero.png` have an alpha
channel, and the phone mockup's drop shadow shows banding without it.
