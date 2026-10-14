// Fails the build when the prices in src/data/plans.ts drift from the SEO copy that restates them
// (index.html JSON-LD + no-JS fallback, public/llms.txt), because a stale price in structured data
// gets quoted by search and AI answers long after the page itself is fixed.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const errors = []

if (!fs.existsSync(path.join(root, 'src/data/plans.ts'))) {
  console.error('check-copy-sync: src/data/plans.ts missing')
  process.exit(1)
}
const prices = [...read('src/data/plans.ts').matchAll(/\bprice:\s*(\d+)/g)].map((m) => Number(m[1]))
if (prices.length < 3) {
  console.error(`check-copy-sync: expected 3 "price: <digits>" in src/data/plans.ts, found ${prices.length}`)
  process.exit(1)
}
const [monthly, half, yearly] = prices
const indian = (n) => String(n).replace(/(\d+?)(?=(\d\d)+(\d)(?!\d))/g, '$1,')
const variants = (n) => [String(n), indian(n), n.toLocaleString('en-IN')]

for (const file of ['index.html', 'public/llms.txt']) {
  const text = read(file)
  for (const [label, n] of [['monthly', monthly], ['half-yearly', half], ['yearly', yearly]]) {
    if (!variants(n).some((v) => text.includes(v))) errors.push(`${file}: ${label} price ${n} not found`)
  }
  for (const banned of ['20+ gyms', 'backed up regularly']) {
    if (text.includes(banned)) errors.push(`${file}: contains "${banned}"`)
  }
}

const html = read('index.html')
const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
const offerPrices = []
const walk = (o) => {
  if (!o || typeof o !== 'object') return
  if (o['@type'] === 'Offer' && o.price !== undefined) offerPrices.push(o.price)
  Object.values(o).forEach(walk)
}
ld.forEach((m) => walk(JSON.parse(m[1])))
if (!offerPrices.length) errors.push('index.html: no JSON-LD Offer price found')
offerPrices.forEach((p) => {
  if (Number(p) !== monthly) errors.push(`index.html: JSON-LD Offer price ${p} is not the monthly price ${monthly}`)
})

if (errors.length) {
  console.error('check-copy-sync failed:\n - ' + errors.join('\n - '))
  process.exit(1)
}
console.log(`check-copy-sync ok (prices ${monthly} / ${half} / ${yearly})`)
