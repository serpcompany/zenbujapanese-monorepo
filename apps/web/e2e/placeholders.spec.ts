import type { Page } from '@playwright/test'
import { sitePages } from '../src/lib/pages'
import { placeholderHref, placeholderLinks } from '../src/lib/site'
import { expect, needed, test } from './test'

const pagesToCheck = [
  ...sitePages.map(page => page.path),
  '/dictionary/search/iru/',
  needed.path,
  '/dictionary/browse/'
]

const listedNames = new Map(placeholderLinks.map(link => [link.id, link.name]))

async function placeholdersOn(page: Page) {
  return page
    .locator(`a[href="${placeholderHref}"]`)
    .evaluateAll(anchors =>
      anchors.map(anchor => anchor.getAttribute('data-outside-link') ?? anchor.outerHTML)
    )
}

async function openPhoneMenu(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Zenbu Japanese' })).toBeVisible()
}

test('every # link the site renders is a placeholder listed in src/lib/site.ts', async ({
  page
}) => {
  test.setTimeout(300_000)
  const onPhone = test.info().project.name === 'phone'
  const found = new Map<string, Set<string>>()
  const unlisted: string[] = []
  for (const path of pagesToCheck) {
    await page.goto(path)
    if (onPhone) await openPhoneMenu(page)
    for (const link of await placeholdersOn(page)) {
      if (!listedNames.has(link)) unlisted.push(`${path}: ${link}`)
      else found.set(link, (found.get(link) ?? new Set()).add(path))
    }
  }
  expect(
    unlisted,
    'A link points at "#" without being in outsideLinks in src/lib/site.ts. Give it its real address, or add it to that list and render it with data-outside-link.'
  ).toEqual([])
  const report = [...found].map(([id, paths]) => `${listedNames.get(id)} (${paths.size} pages)`)
  test.info().annotations.push({ type: 'Placeholder links', description: report.join(', ') })
  console.log(`Placeholder links still "#": ${report.join(', ')}`)
})
