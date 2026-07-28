import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = path.join(projectRoot, 'public', 'icons')
const icon = await readFile(path.join(iconsDir, 'icon.svg'))
const maskableIcon = await readFile(path.join(iconsDir, 'icon-maskable.svg'))

await Promise.all([
  ...[48, 72, 96, 144, 192, 512].map((size) =>
    sharp(icon).resize(size, size).png().toFile(path.join(iconsDir, `icon-${size}.png`)),
  ),
  sharp(icon).resize(180, 180).png().toFile(path.join(iconsDir, 'apple-touch-icon.png')),
  sharp(maskableIcon).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-maskable-192.png')),
  sharp(maskableIcon).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-maskable-512.png')),
])

console.log('Generated GymFlow PWA icons.')
