# GymFlow marketing site: design system (Hallmark redesign 4, premium SaaS, theme "Cobalt", signal colour Royal Blue)

The rules every page of this site follows. Read this before changing any component. Tokens live in `src/index.css`
(semantic names, two values each: light and night) and `src/tokens.css` (the shared scale); components use them, never
raw colour. This file replaces three earlier systems on purpose (steel/Archivo, warm-paper "Dose", poster-caps "Arena"):
the owner wants a premium SaaS landing page, not a gym-themed one. GymFlow is software; the page should look like the
best software pages: calm, exact, spacious, product-first.

## Brief
- **Subject:** software that runs a small gym's front desk (members, fees, attendance, WhatsApp reminders) from a phone.
- **Audience:** gym owners with limited tech experience, mostly on phones over 4G.
- **Job:** start the free trial. The action sits in the nav, in the hero (terms in one line under it) and at the close.
- **Fixed by the owner:** the logo and Royal Blue `#2563eb` are the only colour carried over; real product screens instead
  of icon grids; no claim beyond product facts (no customers yet; "Sample data" under any mock).
- **Headline (owner's words):** "Gym management made effortless".
- **No gym theme:** no fitness imagery, no sporty caps, no weights/trophies, no ink stamps. The product is the picture.

## Look: Cobalt, premium SaaS
Cool near-white paper ruled with 1px hairlines, a refined grotesque for headings, a quiet text face for body, large calm type,
generous space, product screens shown big with layered soft shadows, tactile keycap buttons with a real bottom edge, one
graphite (dark) band, and one electric blue that does every signal. Premium comes from restraint, scale, alignment and polish,
never from decoration. It is not paper-board, not poster-loud, not neon, and not a purple-blue gradient SaaS cliche.
**Light is the default theme** (the first-paint script opens light unless the visitor chose night this visit); night is a
graphite theme with the same structure and the same blue, available through the toggle.

### Colour (tokens in `src/index.css`)
| Role | Light (default) | Night |
|---|---|---|
| `--background` | `oklch(98.6% 0.005 250)` | `oklch(15% 0.02 262)` |
| `--subtle` (second band) | `oklch(96.2% 0.008 252)` | `oklch(19% 0.024 262)` |
| `--frame` / `--muted` (raised white surfaces) | `oklch(100% 0 0)` | `oklch(22% 0.026 262)` |
| `--foreground` ink | `oklch(21% 0.028 262)` | `oklch(94% 0.008 250)` |
| `--muted-foreground` | `oklch(46% 0.02 258)` (AA) | `oklch(74% 0.02 256)` (AA) |
| `--border` hairline | `oklch(90% 0.009 252)` | `oklch(30% 0.03 262)` |
| `--border-strong` | `oklch(83% 0.012 252)` | `oklch(38% 0.035 262)` |
| `--accent` Royal Blue | `#2563eb` | `#2563eb` |
| `--accent-ink` | `#ffffff` | `#ffffff` |
| `--accent-text` / `--accent-strong` | `#1d4ed8` | `#93c5fd` / `#60a5fa` |
| `--accent-soft` (wash) | `#eff4ff` | `#172554` |
| `--band-ink` (the one graphite band) | `oklch(21% 0.024 262)` | `oklch(11% 0.02 262)` |
| `--key-face` / `--key-edge` (keycap) | `oklch(99.4% 0.003 250)` / `oklch(80% 0.016 254)` | `oklch(27% 0.03 262)` / `oklch(12% 0.02 262)` |
One signal colour: blue. No second hue anywhere outside product screens. `--p-mon .. --p-sun` remain for compatibility and hold
quiet blue-grey steps. WhatsApp green stays inside WhatsApp UI (`--wa-*`, `--whatsapp*`); status colours only inside product
screens; `--dash-*`, `--wa-*`, `--ma-*` depict the real apps and keep their values.

### Type
Familjen Grotesk 600 (headings, figures; 500 for item titles; `letter-spacing -0.028em`; line-height 1.02 to 1.08; sentence case;
tabular figures) over IBM Plex Sans 400/500 (body 16 to 18px, lead 19 to 22px, line-height 1.55). JetBrains Mono only for code-like
machine values (IDs, times) inside product tickets, never labels. Scale: `.display-xxl` ~clamp(3.25rem,7.5vw,6.5rem) (hero),
`.display-1` ~5rem, `.display-2` ~3.5rem, `.display-3` ~1.75rem, `.lead`. Labels, captions, table heads: Familjen Grotesk 500 a step
smaller, sentence case, untracked, muted. No all-caps anywhere, no tracked labels, no eyebrows, no italics.

### Surfaces
- A 1px `--border` edges every surface and splits every row. Panels: 14px radius, white `--frame`, hairline border, `--shadow-card`
  (`0 1px 2px` ink at 6% plus `0 12px 32px -16px` ink at 14%): the layered soft shadow is the depth. Large product frames: 20px.
- **Keycaps:** buttons are keys: 48px (44 in the nav), 10px radius, `--key-face` with a 1px border and a 3px `--key-edge` bottom edge
  and a soft drop; the primary is Royal Blue with a `--accent-edge` bottom edge; press sinks 3px (80ms).
- **Graphite band** (`.band-ink`): the ONE dark section per page (full-bleed, rounded 0), used for the dashboard showcase; plus the
  closing `.band-accent` (Royal Blue, white type) once. Two bands a page at most.
- **Ground:** the hero sits on the live ASCII field (see ASCII); `.grid-bg` (a 24px dot tile) is the static fallback for feature-page heads. No grain, no blur, no glass, no gradients, no glow.
- Product screens (HeroDemo, DashboardMock, member app phone, WhatsApp phone) are the imagery: shown at large scale, never
  decorated with browser chrome.

### Controls
Primary keycap (blue), secondary keycap (white), text button. `:focus-visible`: 2px `--ring` outline, 2px offset, instant. Inputs 48px,
10px radius, 1px `--border-strong`, blue ring on focus. Links underline on hover.

## Content and structure: minimal, SEO-friendly, attractive
The owner released the copy: headings and text may be rewritten freely, shortened, and made search-friendly (a plain keyword in the
H1 and each H2, one clear sentence under each). Facts must stay true to the product (see src/data/*.ts and the existing pages);
no invented metrics, customers or claims. Fewer topics, fewer words: one idea per screen, about 40 visible words per section.
**Home page structure (in order):** Hero (H1 "Gym management software made effortless") / the film / Dashboard (graphite band) /
Features (a four-tab switcher: Members, Fees and dues, Attendance, Member app) / WhatsApp reminders / Get started in three steps /
Pricing / FAQ / Close (blue band) / Footer. The old Facts, Purpose, Problems and Founder sections leave the home page (their
components stay in the repo, unused; their key facts live on as the figures in the dashboard band and the bullets in the WhatsApp section).
The 16 feature, guide and docs pages keep their content (it is already search-rich) and take the same look.

## ASCII (a signature of this site)
ASCII is the premium-tech texture: used with restraint, always decorative-plus-interactive, never carrying essential text.
- **AsciiField:** a live ASCII noise field (8x16 cell) behind the hero's top 720px in blue tints, brightening and re-rolling under the cursor.
- **AsciiLogo:** the GymFlow logo drawn in ASCII (footer wordmark and the close band); it decodes once on entering the viewport and ripples
  under the cursor on hover. The nav keeps the real logo image.
- **AsciiIcon (WhatsApp):** a small ASCII WhatsApp glyph in WhatsApp green beside the WhatsApp section heading and inside reminder cards; on
  hover/tap a pulse travels around the bubble, the handset rings and typing dots pop.
All three: canvas or pre, tokens only, paused off screen, static under reduced motion, hidden from screen readers with a real accessible name.

## Composition (product first)
Shape: a premium SaaS narrative. Hero **Settled/centred** over the ASCII field: H1 (`.display-xxl`, two lines, centred), one lead sentence, the
two keycaps, one quiet terms line, then the product shown BIG (the members-list demo on a 20px-radius frame with the layered shadow, the
WhatsApp confirmation floating over its corner as a small white card with a blue chip). Nav: a slim sticky bar (1px bottom hairline).
Sections alternate `--background` and `--subtle`, 128 to 176px apart: the film as a large framed video; ONE graphite band for the dashboard
with four large figures; the features switcher with one big capture; WhatsApp as a Split (heading + three bullets left, ASCII icon + feed
cards right); the three steps as three wide rows with a large light numeral; pricing as two panels (Pro lifted, blue keycap, 1px blue ring);
FAQ as a Split accordion; the blue close band with the ASCII logo; footer on `--background`. Never the same composition in neighbours; no
three-up grid of identical icon cards.

## Motion: smooth and refined
Entrances: 12px translate plus opacity in 500ms `cubic-bezier(.22,1,.36,1)`, once, in view, 60ms stagger. Cards: hover raises the shadow
and shifts the border to `--accent` at 40% (120ms). A pointer spotlight (a soft radial light that follows the cursor inside a panel) on
the feature capture and the pricing panels (fine pointers only). Figures count up once. The tab pill slides by `transform` (240ms). The
hero product floats in with a 700ms rise. `transform` and `opacity` only, never `transition: all`. Reduced motion: the end state.

## Writing
Plain, specific, from the owner's side; imperative verbs on buttons; numerals over words. Product facts only. No dashes in new copy,
no middle-dot meta strings.

## Never
A second accent colour; gradients (including purple-to-blue); glow; glass or blur; grain; all-caps; eyebrows; italics; tracked labels;
gym or fitness imagery; a literal colour or font-family outside the token blocks; `transition: all`; animating width, height, top or
left; `overflow-x: hidden` or `100vw`; a card inside a card; identical three-up icon tiles.

## Review against generic defaults
- Rejected warm-paper plastic, and the poster-caps gym look: both read as themes, not as software.
- Rejected the usual purple-to-blue gradient hero: the premium signal here is scale, space and a precise single blue.
- Kept the product mocks (the real app's screens) as the evidence; the polish goes into type, spacing, edges and shadows.
