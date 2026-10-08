import type { Locator, Page } from '@playwright/test'
import { sitePages } from '../src/lib/pages'
import { placeholderHref, placeholderLinks } from '../src/lib/site'
import { accountButton, accountMenu, expect, needed, test } from './test'

const pagesToCheck = [
  ...sitePages.map(page => page.path),
  '/dictionary/search/iru/',
  needed.path,
  '/dictionary/browse/'
]

const listedNames = new Map(placeholderLinks.map(link => [link.id, link.name]))

async function placeholdersOn(page: Page | Locator) {
  return page
    .locator(`a[href="${placeholderHref}"]`)
    .evaluateAll(anchors =>
      anchors.map(anchor => anchor.getAttribute('data-link-target') ?? anchor.outerHTML)
    )
}

async function placeholdersInPhoneMenu(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click()
  const groups = page
    .getByRole('dialog', { name: 'Zenbu Japanese' })
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button')
  await expect(groups.first()).toBeVisible()
  const links: string[] = []
  for (const group of await groups.all()) {
    if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click()
    await expect(group).toHaveAttribute('aria-expanded', 'true')
    links.push(...(await placeholdersOn(page)))
  }
  return links
}

async function placeholdersWithTheAccountMenu(page: Page) {
  const onThePage = await placeholdersOn(page)
  await accountButton(page).click()
  await expect(accountMenu(page)).toBeVisible()
  return [...onThePage, ...(await placeholdersOn(accountMenu(page)))]
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
    const links = onPhone
      ? await placeholdersInPhoneMenu(page)
      : await placeholdersWithTheAccountMenu(page)
    for (const link of links) {
      if (!listedNames.has(link)) unlisted.push(`${path}: ${link}`)
      else found.set(link, (found.get(link) ?? new Set()).add(path))
    }
  }
  expect(
    unlisted,
    'A link points at "#" without being in linkTargets in src/lib/site.ts. Give it its real address, or add it to that list and render it with data-link-target.'
  ).toEqual([])
  const report = [...found].map(([id, paths]) => `${listedNames.get(id)} (${paths.size} pages)`)
  test.info().annotations.push({ type: 'Placeholder links', description: report.join(', ') })
  console.log(`Placeholder links still "#": ${report.join(', ')}`)
})
