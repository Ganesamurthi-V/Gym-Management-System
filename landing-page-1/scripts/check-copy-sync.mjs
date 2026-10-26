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
const addon = Number(read('src/data/plans.ts').match(/WHATSAPP_ADDON_PRICE\s*=\s*(\d+)/)?.[1])
offerPrices.forEach((p) => {
  if (![0, addon, monthly, yearly].includes(Number(p))) errors.push(`index.html: JSON-LD Offer price ${p} is none of free (0), the add-on ${addon}, monthly ${monthly} or yearly ${yearly}`)
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

// FAQ answers must also match word for word, because the JSON-LD answer is what search results quote.
// Only plain-string answers are paired (the pricing answer is built from plans.ts, so it is skipped).
const ldAnswer = {}
const collectA = (o) => {
  if (!o || typeof o !== 'object') return
  if (o['@type'] === 'Question') ldAnswer[o.name] = o.acceptedAnswer?.text
  Object.values(o).forEach(collectA)
}
ld.forEach((m) => collectA(JSON.parse(m[1])))
const fallbackAnswer = {}
for (const m of html.matchAll(/<h3>(.+?)<\/h3>\s*<p>(.+?)<\/p>/g)) fallbackAnswer[decode(m[1])] = decode(m[2])
let pairedAnswers = 0
for (const m of faqSrc.matchAll(/q:\s*(['"])(.+?)\1,\s*a:\s*(['"])(.+?)\3,\s*\n/g)) {
  const [q, a] = [m[2], m[4]]
  pairedAnswers++
  if (ldAnswer[q] !== a) errors.push(`FAQ answer differs from the FAQPage JSON-LD: "${q}"`)
  if (fallbackAnswer[q] !== a) errors.push(`FAQ answer differs from the no-JavaScript FAQ: "${q}"`)
}
// If FAQ.tsx is reformatted so the pattern above stops matching, the loop compares nothing and the
// check would still print ok. Every question except the plans.ts-built pricing one must be paired.
if (pairedAnswers < faqQuestions.length - 1) errors.push(`FAQ answer check paired ${pairedAnswers} of ${faqQuestions.length - 1} plain-string answers: the pattern no longer matches FAQ.tsx`)

// Homepage section headings: the no-JavaScript copy and the rendered component must say the same thing.
// The rendered text is read from the <h2 id="<title>"> block in each component (ShinyText text="..." and
// {'...'} literals kept, tags dropped). The no-JS h2 is matched by its id.
const flat = (block) =>
  block
    .replace(/<ShinyText text="([^"]*)"[^>]*\/>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\s*(['"])([\s\S]*?)\1\s*\}/g, '$2')
    .replace(/&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
const HEADINGS = [
  ['BentoFeatures', 'features-title', 'features'],
  ['Purpose', 'why-title', 'why'],
  ['Problems', 'problems-title', 'problems'],
  ['Benefits', 'benefits-title', 'benefits'],
  ['WhatsAppSection', 'whatsapp-title', 'whatsapp'],
  ['HowItWorks', 'how-title', 'how'],
  ['Pricing', 'pricing-title', 'pricing'],
  ['FAQ', 'faq-title', 'faq'],
  ['Founder', 'founder-title', 'founder'],
]
for (const [component, titleId, fallbackId] of HEADINGS) {
  const block = read(`src/components/${component}.tsx`).match(new RegExp(`<h2 id="${titleId}"[\\s\\S]*?</h2>`))
  const fb = html.match(new RegExp(`<h2 id="${fallbackId}">(.+?)</h2>`))
  if (!block || !fb) { errors.push(`h2 check: cannot find ${component} (${titleId}) or index.html #${fallbackId}`); continue }
  if (flat(block[0]) !== decode(fb[1])) errors.push(`h2 differs for ${component}: rendered "${flat(block[0])}" vs no-JS "${decode(fb[1])}"`)
}

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
