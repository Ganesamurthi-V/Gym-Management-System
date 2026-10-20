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
if (prices.length < 2) {
  console.error(`check-copy-sync: expected 2 "price: <digits>" in src/data/plans.ts, found ${prices.length}`)
  process.exit(1)
}
const [monthly, yearly] = prices
const indian = (n) => String(n).replace(/(\d+?)(?=(\d\d)+(\d)(?!\d))/g, '$1,')
const variants = (n) => [String(n), indian(n), n.toLocaleString('en-IN')]

for (const file of ['index.html', 'public/llms.txt']) {
  const text = read(file)
  for (const [label, n] of [['monthly', monthly], ['yearly', yearly]]) {
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
// The SoftwareApplication carries one Offer per plan, so an Offer may be the monthly or the yearly
// price, but never anything else. Requiring a monthly one keeps the "from" price (the figure search
// results quote) from silently disappearing if the Offers are ever edited.
offerPrices.forEach((p) => {
  if (Number(p) !== monthly && Number(p) !== yearly) errors.push(`index.html: JSON-LD Offer price ${p} is neither the monthly price ${monthly} nor the yearly price ${yearly}`)
})
if (offerPrices.length && !offerPrices.some((p) => Number(p) === monthly)) errors.push(`index.html: no JSON-LD Offer carries the monthly price ${monthly}`)

// The FAQ is written three times (the accordion, the FAQPage JSON-LD and the no-JavaScript
// copy). Question text drifting between them is what this guards.
const faqSrc = read('src/components/FAQ.tsx')
const faqQuestions = [...faqSrc.matchAll(/^\s*q:\s*(['"])(.+)\1,\s*$/gm)].map((m) => m[2].replace(/\'/g, "'"))
const decode = (str) => str.replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
const ldFaq = []
const collect = (o) => {
  if (!o || typeof o !== 'object') return
  if (o['@type'] === 'Question') ldFaq.push(o.name)
  Object.values(o).forEach(collect)
}
ld.forEach((m) => collect(JSON.parse(m[1])))
const fallbackFaq = [...html.matchAll(/<h3>(.+?)<\/h3>/g)].map((m) => decode(m[1])).slice(-faqQuestions.length)
if (JSON.stringify(faqQuestions) !== JSON.stringify(ldFaq)) errors.push('FAQ.tsx questions differ from the FAQPage JSON-LD (text or order)')
if (JSON.stringify(faqQuestions) !== JSON.stringify(fallbackFaq)) errors.push('FAQ.tsx questions differ from the no-JavaScript FAQ in index.html (text or order)')

// The feature pages' shared head (src/feature-head.html) restates index.html's inline scripts, and the
// CSP in public/_headers is written around them. They must stay byte-identical.
const featureHead = read('src/feature-head.html')
for (const m of html.matchAll(/<script>[\s\S]*?<\/script>/g)) {
  if (!featureHead.includes(m[0])) errors.push('src/feature-head.html is missing an inline script from index.html (copy it over unchanged)')
}

if (errors.length) {
  console.error('check-copy-sync failed:\n - ' + errors.join('\n - '))
  process.exit(1)
}
console.log(`check-copy-sync ok (prices ${monthly} / ${yearly})`)
