// Ícono (1024 px, sin transparencia, como pide la App Store) y pantalla de arranque del app de iPhone.
//   node scripts/make-ios-assets.mjs
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'

const ICONS = 'ios/App/App/Assets.xcassets/AppIcon.appiconset'
const SPLASH = 'ios/App/App/Assets.xcassets/Splash.imageset'

await sharp('public/favicon-beige.png').resize(1024, 1024).flatten({ background: '#C19C80' }).removeAlpha()
  .png().toFile(`${ICONS}/AppIcon-1024.png`)
writeFileSync(`${ICONS}/Contents.json`, JSON.stringify({
  images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'xcode', version: 1 },
}, null, 2))

// Arranque: fondo crema con el logotipo, igual al primer cuadro de la apertura animada del app.
const logo = readFileSync('public/logo-beige.svg', 'utf8')
const size = 2732
const logoWidth = 760
const logoPng = await sharp(Buffer.from(logo), { density: 600 }).resize({ width: logoWidth }).png().toBuffer()
const { height: logoHeight } = await sharp(logoPng).metadata()
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await sharp({ create: { width: size, height: size, channels: 3, background: '#F5F0E8' } })
    .composite([{ input: logoPng, left: Math.round((size - logoWidth) / 2), top: Math.round((size - logoHeight) / 2) }])
    .png().toFile(`${SPLASH}/${name}`)
}
console.log('ícono y arranque del iPhone generados')
