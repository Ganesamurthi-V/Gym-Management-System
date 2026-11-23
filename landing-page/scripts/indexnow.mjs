// Tells Bing (and other IndexNow engines) which URLs changed, right after a deploy. Bing's webmaster
// guidelines ask for IndexNow on add, update and delete. Run it AFTER the deploy is live, because the
// engine fetches the key file from the site to verify ownership:
//   npm run indexnow                 submit every URL in sitemap.xml
//   npm run indexnow -- /pricing /   submit only these paths
// The key is public by design: public/<key>.txt contains the same string as its own file name.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST = 'www.thegymflow.in'
const KEY = 'd6f65ce0eae5477e8949daf2ed7b7e88'

if (fs.readFileSync(path.join(root, 'public', `${KEY}.txt`), 'utf8').trim() !== KEY) {
  console.error('indexnow: public/<key>.txt does not contain the key')
  process.exit(1)
}

const paths = process.argv.slice(2)
const urlList = paths.length
  ? paths.map((p) => `https://${HOST}${p.startsWith('/') ? p : `/${p}`}`)
  : [...fs.readFileSync(path.join(root, 'public', 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
})
// 200 = accepted, 202 = accepted and key validation pending. Anything else is a failure.
console.log(`indexnow: ${urlList.length} URLs, HTTP ${res.status}`)
process.exit(res.status === 200 || res.status === 202 ? 0 : 1)
