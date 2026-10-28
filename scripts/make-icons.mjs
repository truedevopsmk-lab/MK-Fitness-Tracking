// Render public/icon.svg to the PNG icons the manifest and iOS need.  node scripts/make-icons.mjs
import { launch } from './browser.mjs'
import { readFileSync } from 'node:fs'

const root = new URL('../public/', import.meta.url).pathname
const svg = readFileSync(`${root}icon.svg`, 'utf8')
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect[^>]*\/>\s*/, '')

// any: rounded tile as designed. maskable: full-bleed bg, artwork scaled into the 80% safe zone. apple: full-bleed (iOS rounds it).
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${svg.match(/<rect[^>]*\/>/)[0]}${inner}</svg>`
const bleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#071014"/><g transform="translate(256 256) scale(.8) translate(-256 -256)">${inner}</g></svg>`
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#071014"/><g transform="translate(256 256) scale(.92) translate(-256 -256)">${inner}</g></svg>`
const jobs = [['icon-192.png', 192, tile], ['icon-512.png', 512, tile], ['icon-maskable-512.png', 512, bleed], ['apple-touch-icon.png', 180, apple]]

const browser = await launch()
for (const [file, size, markup] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`)
  await page.screenshot({ path: `${root}${file}`, omitBackground: true })
  await page.close()
  console.log('wrote', file)
}
await browser.close()
