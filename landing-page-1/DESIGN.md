# GymFlow marketing site: design system

The rules every page of this site follows. Read this before changing any component. Tokens live in
`src/index.css`; components must use them, never raw hex.

## Brief
- **Subject:** the front desk of a small independent gym in India. The owner runs it from a phone, between
  training clients, with a register book, a cash box, a UPI QR sticker and WhatsApp.
- **Audience:** gym owners with limited tech experience, mostly on phones over 4G.
- **Primary job:** in one screen, show what GymFlow does for that desk (renewals, dues, attendance, reminders)
  and get the owner to start the free trial.
- **Fixed by the owner:** light theme first, Royal Blue #2563EB as the one accent (logo, favicon and the app use it),
  real product screens instead of icon-card grids, no claims beyond product facts (there are no customers yet).

## Colour
| Name | Light | Dark | Use |
|---|---|---|---|
| Chalk | `#F1F4F8` | `#0D1526` | page background (a cool, steel-tinted light; the dark is a deep navy, never near-black) |
| Paper | `#FFFFFF` | `#15203A` | raised surfaces: product screens, panels |
| Ink | `#14213D` | `#E9EEF6` | headings and body text |
| Steel | `#53627A` | `#9FAEC4` | secondary text (AA on Chalk and Paper) |
| Royal | `#2563EB` | `#3B82F6` | actions and links; `#1D4ED8` / `#93C5FD` when used as text |
| Line | `#D9E0EA` | `#26324D` | borders and dividers |

WhatsApp green appears only inside WhatsApp UI (the `--wa-*` tokens). Status colours (Active / Expiring / Expired) appear only
inside product screens, the way the app shows them.

## Type
One family, **Archivo** (variable, width 62-125, weight 400-900), chosen for its condensed widths: tall, tight,
bold sentence-case headlines read like gym signage and the stencilled numbers on plates. Body is the same family at normal width, so
the two roles are distinct by width and weight, not by a second typeface.

| Role | Setting |
|---|---|
| Display (h1) | width 70, weight 800, 44-96px, line-height 0.95, letter-spacing -0.01em |
| Heading (h2) | width 75, weight 750, 32-56px, line-height 1.0 |
| Subheading (h3) | width 100, weight 650, 18-22px |
| Body / lead | width 100, weight 400, 16-19px, line-height 1.6, measure under 70ch |
| UI and numbers | width 100, weight 600, `font-variant-numeric: tabular-nums` |

No all-caps labels, no monospace labels, no one-word colour/italic accents inside headings.

## Layout system (src/components/layout/Section.tsx)
Every section on every page is built from the same parts; a section never invents its own spacing,
width or background.

- **Section** sets the tone, padding (`py-24 md:py-32`) and the 1200px column. Tones: `chalk` (page
  colour), `paper` (white band) and `ink` (the dark band). Backgrounds are plain colour: no textures,
  patterns or animated backgrounds.
- **Two layouts only:**
  - **Split**: heading on the left (sticky on wide screens), content on the right. For lists, steps,
    questions, and one product screen beside its explanation.
  - **Showcase**: heading on top, then one wide thing (the full console, the plan panels).
- **RuledList** is the one list style: ruled rows, bold short title, one sentence.
- **Product screens** appear where they prove the section's point, one per section at most: hero (the
  renewal story), features (the full console), benefits (the dashboard), WhatsApp (the phone and the
  morning feed). Never one per paragraph.
- Left-aligned text everywhere except the closing CTA line. 20px side gutter on phones.
- Radius follows hierarchy: device frames 28px, panels 16px, buttons 10px, status chips 6px.
- Numbered markers only where the content is a sequence (setup steps, the reminder timeline).

## Motion
One orchestrated moment: the hero product demo plays its sequence once on load (and again on tap). No fade-up on every section,
no hover lift on every card. Motion that answers an action (accordion, tabs, play) stays. Everything respects reduced motion.

## Writing
Plain, specific, sentence case, from the owner's side. Buttons say what happens ("Start free trial", "See pricing").
Product facts only, as stated in `src/data/featurePages.ts`; "Sample data" under any mock that shows names or amounts.

## Review against generic defaults
- Rejected warm cream with a serif display (the most common generated look) for steel-tinted chalk and one condensed sans tied to gym signage.
- Rejected hairline broadsheet columns and dense rules; structure comes from product screens and spacing.
- Rejected the card kit (identical rounded cards with icon tiles), tracked all-caps eyebrows, monospace labels and one-word italic accents,
  all of which the previous version used.
- Kept Royal Blue because the owner fixed it and the product already uses it; the boldness is spent on the hero type and the product demo.
