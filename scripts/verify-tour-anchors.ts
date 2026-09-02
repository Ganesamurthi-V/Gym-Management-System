/**
 * scripts/verify-tour-anchors.ts
 * ──────────────────────────────
 * Guards the guided tour against its most likely regression: a step that points
 * at an anchor nobody renders any more.
 *
 * TypeScript already proves that every `step.anchor` is a key of `TOUR_ANCHORS`.
 * What it cannot prove is that the matching anchor is still ATTACHED to markup —
 * someone refactoring a page can delete the `{...tourAttr('x')}` spread and every
 * type check, test and build still passes, while the tour quietly falls back to a
 * centred popover instead of spotlighting the control.
 *
 * Anchors reach the DOM three ways, so all three are detected:
 *   1. `{...tourAttr('key')}`      — the normal case, gives the key directly
 *   2. `{...navTourAttr(label)}`   — generic, covers every NAV_ITEMS entry at once
 *   3. `data-tour="value"`         — a hand-written literal, if one ever appears
 *
 * Run with:  npm run verify:tour
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { NAV_ANCHOR_BY_LABEL, TOUR_ANCHORS, type TourAnchorKey } from '../lib/tours/anchors'
import { TOUR_CHAPTERS, isStepInViewport } from '../lib/tours/definitions'
import { TOUR_CHAPTER_IDS } from '../lib/tours/progress'

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.vercel',
  '.husky',
  'gymflow-admin',
  'gymflow-member',
  'gymflow-mobile',
  'landing-page',
  'demo',
  'public',
  'coverage',
  'scripts',
])

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectSourceFiles(full, out)
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full)
  }
  return out
}

const ANCHOR_KEYS = Object.keys(TOUR_ANCHORS) as TourAnchorKey[]
const VALUE_TO_KEY = new Map<string, TourAnchorKey>(
  ANCHOR_KEYS.map(key => [TOUR_ANCHORS[key], key]),
)

function main(): void {
  const root = process.cwd()
  const files = collectSourceFiles(root)

  /** anchor key -> files that attach it */
  const attachedIn = new Map<TourAnchorKey, string[]>()
  const record = (key: TourAnchorKey, file: string) => {
    const list = attachedIn.get(key) ?? []
    if (!list.includes(file)) list.push(file)
    attachedIn.set(key, list)
  }

  const navHelperFiles: string[] = []

  for (const file of files) {
    const rel = relative(root, file)
    // The registry itself declares the names; it does not attach them.
    if (rel === join('lib', 'tours', 'anchors.ts')) continue

    const contents = readFileSync(file, 'utf8')

    for (const match of contents.matchAll(/\btourAttr\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)) {
      const key = match[1] as TourAnchorKey
      if (ANCHOR_KEYS.includes(key)) record(key, rel)
    }

    for (const match of contents.matchAll(/data-tour=["']([A-Za-z0-9_-]+)["']/g)) {
      const key = VALUE_TO_KEY.get(match[1])
      if (key) record(key, rel)
    }

    if (/\bnavTourAttr\(/.test(contents)) navHelperFiles.push(rel)
  }

  const failures: string[] = []
  const info: string[] = []

  // `navTourAttr` is applied generically inside the NAV_ITEMS map, so every nav
  // anchor is attached wherever that helper is called — provided the label it is
  // keyed by still exists in that file.
  if (navHelperFiles.length === 0) {
    failures.push('navTourAttr() is never called, so no navigation anchor reaches the DOM.')
  } else {
    const navSources = navHelperFiles.map(f => readFileSync(join(root, f), 'utf8')).join('\n')
    for (const [label, key] of Object.entries(NAV_ANCHOR_BY_LABEL) as [string, TourAnchorKey][]) {
      if (navSources.includes(`'${label}'`) || navSources.includes(`"${label}"`)) {
        for (const f of navHelperFiles) record(key, f)
      } else {
        failures.push(
          `NAV_ANCHOR_BY_LABEL maps "${label}" -> "${key}", but no nav item with that label exists in ${navHelperFiles.join(', ')}.`,
        )
      }
    }
  }

  // Anchors the tour actually asks for.
  const referenced = new Set<TourAnchorKey>()
  for (const chapter of TOUR_CHAPTERS) {
    for (const step of chapter.steps) {
      if (step.anchor) referenced.add(step.anchor)
    }
  }

  // 1. Every referenced anchor must be attached somewhere. This is the check
  //    that actually protects the tour.
  for (const key of referenced) {
    if (!attachedIn.has(key)) {
      failures.push(
        `Step anchor "${key}" (data-tour="${TOUR_ANCHORS[key]}") is not attached by any component.`,
      )
    }
  }

  // 2. An anchor that is neither referenced nor attached is dead weight.
  for (const key of ANCHOR_KEYS) {
    if (!referenced.has(key) && !attachedIn.has(key)) {
      failures.push(`Anchor "${key}" is unused: no step references it and nothing attaches it.`)
    } else if (!referenced.has(key)) {
      info.push(`"${key}" is attached but no step uses it yet (reserved for future steps).`)
    }
  }

  // 3. Chapter ids must match the persisted contract exactly, and in order.
  const definedIds = TOUR_CHAPTERS.map(c => c.id)
  const contractIds = [...TOUR_CHAPTER_IDS]
  if (definedIds.join(',') !== contractIds.join(',')) {
    failures.push(
      `Chapter ids disagree with TOUR_CHAPTER_IDS.\n          definitions: ${definedIds.join(', ')}\n          contract:    ${contractIds.join(', ')}`,
    )
  }

  // 4. A chapter with no steps on a viewport would strand the tour there.
  for (const chapter of TOUR_CHAPTERS) {
    for (const [label, isDesktop] of [
      ['desktop', true],
      ['mobile', false],
    ] as const) {
      if (chapter.steps.filter(s => isStepInViewport(s, isDesktop)).length === 0) {
        failures.push(`Chapter "${chapter.id}" has no steps on ${label}.`)
      }
    }
  }

  const multiAttached = [...attachedIn.entries()].filter(([, list]) => list.length > 1)

  const rule = '─'.repeat(70)
  const desktopSteps = TOUR_CHAPTERS.reduce(
    (n, c) => n + c.steps.filter(s => isStepInViewport(s, true)).length,
    0,
  )
  const mobileSteps = TOUR_CHAPTERS.reduce(
    (n, c) => n + c.steps.filter(s => isStepInViewport(s, false)).length,
    0,
  )

  console.log(`\n${'═'.repeat(70)}`)
  console.log('  Guided Tour Anchor Verification')
  console.log('═'.repeat(70))
  console.log(`  Chapters                ${TOUR_CHAPTERS.length}`)
  console.log(`  Steps authored          ${TOUR_CHAPTERS.reduce((n, c) => n + c.steps.length, 0)}`)
  console.log(`  Steps on desktop        ${desktopSteps}`)
  console.log(`  Steps on mobile         ${mobileSteps}`)
  console.log(`  Anchors in registry     ${ANCHOR_KEYS.length}`)
  console.log(`  Anchors used by steps   ${referenced.size}`)
  console.log(`  Anchors attached        ${attachedIn.size}`)
  console.log(rule)

  if (multiAttached.length > 0) {
    console.log('  Attached in more than one file (confirm the branches are exclusive):')
    for (const [key, list] of multiAttached) {
      console.log(`    ${key}`)
      for (const f of list) console.log(`        ${f}`)
    }
    console.log(rule)
  }

  for (const line of info) console.log(`  INFO  ${line}`)
  if (info.length > 0) console.log(rule)
  for (const line of failures) console.log(`  FAIL  ${line}`)

  if (failures.length === 0) {
    console.log('  Passed: every tour step points at an attached anchor.')
    console.log(`${'═'.repeat(70)}\n`)
    return
  }

  console.log(`${'═'.repeat(70)}`)
  console.log(`  ${failures.length} failure(s).\n`)
  process.exit(1)
}

main()
