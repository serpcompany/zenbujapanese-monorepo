import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const out = fileURLToPath(new URL('./out/', import.meta.url))
const hostile = `html{font-size:10px} body{font-family:serif;color:rgb(255,0,0);line-height:3;letter-spacing:2px}
:root{--card:rgb(0,255,0);--background:rgb(0,255,0);--radius:0px;--font-sans:serif}
@font-face{font-family:SpikeGeistDoc;src:url(/geist.woff2) format("woff2")}`
const variants = { A: 'a-raw.css', B: 'b-host.css', C: 'c-host-px.css', D: 'd-reset.css' }
const browser = await chromium.launch({ executablePath: process.env.SPIKE_CHROME })
console.log('browser', browser.version())
for (const [name, file] of Object.entries(variants)) {
  for (const hoist of name >= 'C' ? [false, true] : [false]) {
    const page = await browser.newPage()
    await page.route('http://spike.test/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>${hostile}</style>${hoist ? `<style>${readFileSync(out + 'properties.css', 'utf8')}</style>` : ''}</head><body><p>page text</p><div id="host"></div><script src="/app.js"></script></body></html>` })
      if (path === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(out + 'app.js') })
      if (path === '/geist.woff2') return route.fulfill({ contentType: 'font/woff2', body: readFileSync(out + 'geist.woff2') })
      return route.fulfill({ status: 404 })
    })
    await page.addInitScript(css => { window.SPIKE_CSS = css }, readFileSync(out + file, 'utf8'))
    await page.goto('http://spike.test/')
    await page.waitForTimeout(1500)
    const result = await page.evaluate(async () => {
      await document.fonts.ready
      const root = document.getElementById('host').shadowRoot
      const css = (el, ...props) => { if (!el) return 'missing'; const s = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, s.getPropertyValue(p)])) }
      const w = id => root.getElementById(id)?.getBoundingClientRect().width.toFixed(1)
      const bodyPopup = document.body.querySelector('.default-portal-popup')
      return {
        card: css(root.getElementById('card'), 'background-color', 'border-radius', 'box-shadow', 'padding-top'),
        wrap: css(root.getElementById('wrap'), 'font-family', 'color', 'line-height', 'letter-spacing', 'padding-top'),
        button: css(root.getElementById('btn'), 'box-shadow', 'height', 'background-color'),
        defaultPortalPopup: { inBody: !!bodyPopup, inShadow: !!root.querySelector('.default-portal-popup'), ...css(bodyPopup, 'background-color', 'box-shadow', 'border-radius') },
        shadowPortalPopup: css(root.getElementById('shadow-popup'), 'background-color', 'box-shadow', 'border-radius'),
        fonts: { shadowFace: w('shadowfont'), docFace: w('docfont'), monospace: w('mono'), documentFonts: [...document.fonts].map(f => `${f.family}:${f.status}`) },
        headStyles: [...document.head.querySelectorAll('style')].map(s => s.textContent.slice(0, 40))
      }
    })
    console.log(`\n== ${name}${hoist ? '+hoisted @property' : ''}\n` + JSON.stringify(result, null, 1))
    await page.close()
  }
}
await browser.close()
