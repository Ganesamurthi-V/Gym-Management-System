# GymFlow marketing site: design system (taste-skill redesign of the home page, theme "Cobalt", signal colour Royal Blue)

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
generous space, product screens shown big on hairline frames, one flat button, one
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

### Surfaces and controls
Superseded by "Taste redesign" below: one 12px card with a 1px hairline, 20px picture frames, one flat 44px button, no shadows, no keycap edges.
Inputs are 48px with an 8px radius and a 1px `--border-strong` line; `:focus-visible` is a 2px `--ring` outline, 2px offset.

## Taste redesign (taste-skill 2.5, page kind: software)
Built from the taste-skill rules; the Royal Blue brand, the circular logo, the tokens in `src/index.css` and every price in
`src/data/plans.ts` are unchanged. Home headings, FAQ and the H1 are unchanged, so the no-JavaScript block in `index.html` still matches
(`scripts/check-copy-sync.mjs`).

### Layout system (`src/styles/home.css`, `src/components/layout/Section.tsx`)
- **One wrap:** `.wrap` = min(100% - 2 x gutter, 1200px), gutter 20 / 32 / 40 (phone / tablet / desktop). The header, every section and the
  footer use it, so left and right edges are equal (x 120 and 1320 at 1440).
- **One section box:** `.sec` = 120px top padding (112 / 96 smaller), 56px bottom, `min-height: 100svh` from 768px up (content height
  under 640px). The H2 is the first child, left aligned. The hero is exactly `100svh` from 1024px up, alone on the first screen.
- **Splits** share one line: text left on columns 1-6, picture right on 7-12; one column under 1024px with the text first.
- **Type:** Familjen Grotesk 600 / IBM Plex Sans (unchanged). h1 56 (clamp 38-56), h2 48 (clamp 30-48), h3 28, card title 20, body 16, lead
  20. Nothing under 13px.
- **One of each:** button (flat, 44px, 8px radius, 1px border; hover steps the fill 14% toward ink and lifts 1px; press sinks 1px and scales .985),
  card (`.panel`: white, hairline, 12px, no shadow; a linked card lifts 2px), picture frame (`.shot`: 20px, 3:2, cropped to the top of the
  capture, image zooms 1.02 on hover), link (`.link`: hairline at rest, an accent line draws on hover). Radius scale 8 / 12 / 20.
- **Grounds:** page colour and `--subtle` alternate; one graphite band (WhatsApp); one Royal Blue close. No gradient except the 140px
  fade-out mask under the hero product.
- **No captions** under any picture or mock ("Sample data" lines are gone). No placeholders: the member app, which has no tablet capture, is the
  live HTML `MemberAppCard`.

### Home page, in order
1. **Hero:** H1 and, on the same row, the lead, the two buttons and one fact line (14-day trial, no card, free up to 50 members); under it the
   live owner console (`DashboardMock`) cut by the fold under a fade. On phones the member app Home takes its place. No entrance animation.
2. **Film** (`#film`): heading and one line, then the film across the wrap.
3. **Features** (`#features`, two screens): three rows, text left (heading, sentence, ruled facts, link) and the product screen right.
4. **Comparison** (`#problems`): one ruled table in a panel; stacked rows on phones.
5. **WhatsApp** (`#whatsapp`, graphite band): heading, six schedule items in two columns, the phone with a message picker on the right.
6. **Built for India** (`#india`): heading beside a live "Record a fee" slip (UPI chosen), six ruled facts under it.
7. **Steps** (`#how`): three columns, each a small piece of the real app, a heading and two facts.
8. **Pricing** (`#pricing`): heading and a Monthly / Yearly switch on one row, a free card and a Pro card of equal height.
9. **FAQ** (`#faq`): every answer open, two columns on the split line.
10. **Close:** the Royal Blue band, left aligned, the main action in the same wording as the nav and hero.
11. **Footer:** same wrap, three columns, legal row.

## Motion: hover and press only
Nothing animates on load or on scroll: no reveal, rise, tilt, magnet, spotlight, smooth-scroll library or counting number. What moves:
buttons step and press, a linked card lifts 2px, a linked picture zooms 1.02, links and nav words draw an underline, tabs and pickers swap on
click. The film and the message picker are the visitor's. `prefers-reduced-motion` removes the transforms and keeps the colour changes.
The old ASCII field, ASCII logo and `Rise` / `Tilt` components are no longer used by the home page (the feature pages still import some).

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
