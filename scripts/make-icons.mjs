// Genera los íconos PNG reales de la PWA a partir del ícono de marca.
import sharp from 'sharp'
const src = 'public/favicon-beige.png'
for (const size of [180, 192, 512]) {
  await sharp(src).resize(size, size).flatten({ background: '#C19C80' }).png().toFile(`public/icons/icon-${size}.png`)
}
await sharp(src).resize(64, 64).png().toFile('public/favicon.png')
console.log('íconos generados')
