# Archived from landing-page-1 (2026-10-06)

The hero's interactive dashboard demo, set aside while the launch film takes its place in the hero.

- `DashboardMock.tsx` — the component (was `landing-page-1/src/components/DashboardMock.tsx`). Its styles are still
  in `landing-page-1/src/index.css`, and `public/hero.webp` (the narrow-screen fallback image) is still in place.
- `hero-product-shot.tsx.txt` — the block of `Hero.tsx` that rendered it, window chrome included.

To restore: move `DashboardMock.tsx` back, re-add its import and the `interactive` media query in `Hero.tsx`, and
paste the block back in place of `<HeroVideo />`.
