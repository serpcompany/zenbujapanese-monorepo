import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { missingPage, openPageType, type PageType, pageTypes } from './page-types'
import { test } from './test'

const folder = resolve(process.env.E2E_GALLERY ?? '')
const themes = ['light', 'dark'] as const
const galleryWidth = 390
const shown = [...pageTypes, missingPage]

test.skip(({ isMobile }) => !isMobile, 'The gallery is of phones')
test.use({
  viewport: { width: galleryWidth, height: 844 },
  deviceScaleFactor: 2,
  allowedConsoleErrors: [/status of 404/]
})

const fileFor = (index: number, { name }: PageType, theme: string) =>
  `${String(index + 1).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${theme}.png`

const escaped = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function galleryPage(baseURL: string) {
  const sections = shown.map((pageType, index) => {
    const figures = themes.map(
      theme => `<figure><figcaption>${theme}</figcaption>
<a href="${fileFor(index, pageType, theme)}"><img src="${fileFor(index, pageType, theme)}" alt="${escaped(`${pageType.name}, ${theme}`)}" loading="lazy" width="${galleryWidth}"></a></figure>`
    )
    return `<section id="page-${index + 1}"><h2>${index + 1}. ${escaped(pageType.name)}</h2>
<p><a href="${escaped(baseURL + pageType.path)}">${escaped(decodeURI(pageType.path))}</a></p>
<div class="shots">${figures.join('\n')}</div></section>`
  })
  const contents = shown
    .map(({ name }, index) => `<li><a href="#page-${index + 1}">${escaped(name)}</a></li>`)
    .join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phone gallery</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0 auto; padding: 16px; max-width: 1200px; background: Canvas; color: CanvasText; }
ol { columns: 3 14rem; }
section { border-top: 1px solid GrayText; padding-top: 8px; margin-top: 24px; }
.shots { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
figure { margin: 0; }
img { display: block; max-width: 100%; height: auto; border: 1px solid GrayText; }
</style></head><body>
<h1>Every page type at ${galleryWidth} px, light and dark</h1>
<p>Taken from ${escaped(baseURL)}.</p>
<ol>${contents}</ol>
${sections.join('\n')}
</body></html>
`
}

for (const theme of themes) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const [index, pageType] of shown.entries()) {
      test(`captures ${pageType.name}`, async ({ page, baseURL }) => {
        await openPageType(page, pageType)
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({
          path: join(folder, fileFor(index, pageType, theme)),
          fullPage: true,
          caret: 'initial'
        })
        writeFileSync(join(folder, 'index.html'), galleryPage(baseURL ?? ''))
      })
    }
  })
}
