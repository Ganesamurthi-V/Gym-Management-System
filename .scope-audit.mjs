import fs from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components']
const SKIP = /node_modules|gymflow-admin|gymflow-mobile|gymflow-member|landing-page|_archived|\.next/

const files = []
function walk(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (SKIP.test(full)) continue
    if (e.isDirectory()) walk(full)
    else if (/\.(tsx|css)$/.test(e.name)) files.push(full)
  }
}
for (const r of ROOTS) walk(r)

// Surfaces that are deliberately dark while the app is in LIGHT mode. A palette
// inversion would turn these light in dark mode, which is backwards.
const DARK_SURFACE = /\b(?:bg|from|via|to)-(?:slate|gray|zinc|neutral|stone)-(?:700|800|900|950)\b|\bbg-black\b/g
// Arbitrary hex/rgb values never participate in a palette remap.
const ARBITRARY = /\b(?:bg|text|border|from|to|via|ring|shadow|fill|stroke)-\[(?:#|rgb|hsl)[^\]]*\]/g
// Inline style colours are equally invisible to Tailwind.
const INLINE_COLOR = /(?:background(?:Color)?|color|borderColor)\s*:\s*['"`]?#[0-9a-fA-F]{3,8}/g

const darkSurfaces = []
const arbitrary = []
const inline = []

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = f
  const d = src.match(DARK_SURFACE) || []
  const a = src.match(ARBITRARY) || []
  const i = src.match(INLINE_COLOR) || []
  if (d.length) darkSurfaces.push({ rel, n: d.length, sample: [...new Set(d)].slice(0, 4).join(' ') })
  if (a.length) arbitrary.push({ rel, n: a.length, sample: [...new Set(a)].slice(0, 3).join(' ') })
  if (i.length) inline.push({ rel, n: i.length })
}

const sum = (arr) => arr.reduce((t, x) => t + x.n, 0)

console.log('=== intentionally-dark surfaces (must NOT invert) ===')
console.log('files:', darkSurfaces.length, ' utilities:', sum(darkSurfaces))
for (const x of darkSurfaces.sort((a, b) => b.n - a.n).slice(0, 18)) {
  console.log(String(x.n).padStart(4), x.rel, '|', x.sample)
}

console.log('')
console.log('=== arbitrary colour values (invisible to a palette remap) ===')
console.log('files:', arbitrary.length, ' utilities:', sum(arbitrary))
for (const x of arbitrary.sort((a, b) => b.n - a.n).slice(0, 12)) {
  console.log(String(x.n).padStart(4), x.rel, '|', x.sample)
}

console.log('')
console.log('=== inline style hex colours ===')
console.log('files:', inline.length, ' occurrences:', sum(inline))
for (const x of inline.sort((a, b) => b.n - a.n).slice(0, 10)) {
  console.log(String(x.n).padStart(4), x.rel)
}
