/**
 * compress-logo.js
 * Resizes public/logo.png to 400×400 px (2× Retina) and saves it in-place as an
 * optimized PNG. Then copies the result to gymflow-admin/public/logo.png so the
 * duplicate is also updated and both deploys use the same compressed source.
 *
 * Run from the project root: node scripts/compress-logo.js
 */

const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const MAIN_LOGO   = path.join(ROOT, 'public', 'logo.png')
const ADMIN_LOGO  = path.join(ROOT, 'gymflow-admin', 'public', 'logo.png')
const TARGET_SIZE = 400 // px — 2× for Retina; Next.js <Image> will downscale for smaller displays

async function main() {
  const originalBytes = fs.statSync(MAIN_LOGO).size
  console.log(`\nOriginal: ${MAIN_LOGO}`)
  console.log(`  Size before: ${(originalBytes / 1024).toFixed(1)} KB`)

  // Resize to 400×400 px, fit inside (no upscaling), keep transparency, strip metadata
  const compressed = await sharp(MAIN_LOGO)
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'inside',         // preserve aspect ratio — never upscale
      withoutEnlargement: true,
    })
    .png({
      compressionLevel: 9,   // maximum zlib compression (lossless)
      adaptiveFiltering: true,
      palette: false,        // keep full colour depth (logos often have gradients)
    })
    .toBuffer()

  fs.writeFileSync(MAIN_LOGO, compressed)
  const newBytes = fs.statSync(MAIN_LOGO).size
  console.log(`  Size after:  ${(newBytes / 1024).toFixed(1)} KB`)
  console.log(`  Saved:       ${((1 - newBytes / originalBytes) * 100).toFixed(1)}% reduction`)

  // Sync the compressed file to the admin public folder
  fs.copyFileSync(MAIN_LOGO, ADMIN_LOGO)
  console.log(`\nCopied to: ${ADMIN_LOGO}`)
  console.log(`  Size: ${(fs.statSync(ADMIN_LOGO).size / 1024).toFixed(1)} KB`)

  console.log('\n✅ Done. Next.js <Image> will further convert to WebP (~8–15 KB) on delivery.')
}

main().catch(err => { console.error(err); process.exit(1) })
