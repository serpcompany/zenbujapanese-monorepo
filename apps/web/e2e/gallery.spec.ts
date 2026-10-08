import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { missingPage, openPageType, type PageType, type PageView, pageTypes } from './page-types'
import { test } from './test'

const folder = resolve(process.env.E2E_GALLERY ?? '')
const themes = ['light', 'dark'] as const
const galleryWidth = 390

interface Shot {
  name: string
  pageType: PageType
  views: PageView[]
}

const shots: Shot[] = [...pageTypes, missingPage].flatMap(pageType => [
  { name: pageType.name, pageType, views: [] },
  ...(pageType.views ?? []).map((view, index, views) => ({
    name: `${pageType.name}, ${view.name}`,
    pageType,
    views: views.slice(0, index + 1)
  }))
])

test.skip(({ isMobile }) => !isMobile, 'The gallery is of phones')
test.use({
  viewport: { width: galleryWidth, height: 844 },
  deviceScaleFactor: 2,
  allowedConsoleErrors: [/status of 404/]
})

const fileFor = (index: number, { name }: Shot, theme: string) =>
  `${String(index + 1).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${theme}.png`

const escaped = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function galleryPage(baseURL: string) {
  const sections = shots.map((shot, index) => {
    const figures = themes.map(
      theme => `<figure><figcaption>${theme}</figcaption>
<a href="${fileFor(index, shot, theme)}"><img src="${fileFor(index, shot, theme)}" alt="${escaped(`${shot.name}, ${theme}`)}" loading="lazy" width="${galleryWidth}"></a></figure>`
    )
    const { path } = shot.pageType
    return `<section id="page-${index + 1}"><h2>${index + 1}. ${escaped(shot.name)}</h2>
<p><a href="${escaped(baseURL + path)}">${escaped(decodeURI(path))}</a></p>
<div class="shots">${figures.join('\n')}</div></section>`
  })
  const contents = shots
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

    for (const [index, shot] of shots.entries()) {
      test(`captures ${shot.name}`, async ({ page, baseURL }) => {
        await openPageType(page, shot.pageType)
        for (const view of shot.views) await view.show(page)
        await page.evaluate(() => document.fonts.ready)
        await page.mouse.move(0, 0)
        await page.screenshot({
          path: join(folder, fileFor(index, shot, theme)),
          fullPage: !shot.views.at(-1)?.overlay,
          caret: 'initial'
        })
        writeFileSync(join(folder, 'index.html'), galleryPage(baseURL ?? ''))
      })
    }
  })
}
