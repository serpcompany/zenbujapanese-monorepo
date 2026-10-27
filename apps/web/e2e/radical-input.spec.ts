import type { Page } from '@playwright/test'
import { fixtureLeadingEntries, fixtureRadicals } from '@zenbu/dictionary-core/fixtures'
import { RadicalLookup } from '@zenbu/dictionary-core/search/radicals'
import type { Locale } from '../src/lib/i18n/config'
import { getDictionary } from '../src/lib/i18n/dictionary'
import { fill } from '../src/lib/i18n/format'
import { localizedPath } from '../src/lib/i18n/paths'
import { openRadicalPanel, radicalPanel } from './page-types'
import { expect, searchOrder, test } from './test'

const lookup = new RadicalLookup(fixtureRadicals)
const offered = (picked: string[]) =>
  lookup.panel(picked).groups.flatMap(group => group.radicals.map(({ glyph }) => glyph))

const radical = (page: Page, glyph: string, locale: Locale = 'en') =>
  radicalPanel(page, locale).getByRole('button', {
    name: fill(getDictionary(locale).searchForm.radicals.radical, { glyph }),
    exact: true
  })

const candidates = (page: Page, locale: Locale = 'en') =>
  radicalPanel(page, locale)
    .getByRole('list', { name: getDictionary(locale).searchForm.radicals.candidates })
    .getByRole('link')

const wordRowPaths = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('link')
    .evaluateAll(links =>
      links
        .map(link => link.getAttribute('href') ?? '')
        .filter(href => /^\/dictionary\/[^/]+-\d+\/$/.test(href))
    )

test.describe('radical input', () => {
  test('the search box’s Radicals finds a kanji by its radicals and searches it for its leading words', async ({
    page
  }) => {
    const text = getDictionary('en').searchForm.radicals
    await page.goto('/dictionary/')
    await openRadicalPanel(page, 'en')
    await expect(radicalPanel(page, 'en').getByText(text.prompt)).toBeVisible()
    await radical(page, '女').click()
    await expect(radical(page, '女')).toHaveAttribute('aria-pressed', 'true')
    await expect(candidates(page)).toHaveText(lookup.panel(['女']).candidates)
    const cantCombine = offered([]).find(glyph => !offered(['女']).includes(glyph)) ?? ''
    await expect(radical(page, cantCombine)).toHaveCount(0)
    await radical(page, '西').click()
    await expect(candidates(page)).toHaveText(['要', '腰', '嫖'])
    await radicalPanel(page, 'en').getByRole('button', { name: text.undo }).click()
    await expect(candidates(page)).toHaveText(lookup.panel(['女']).candidates)
    await radical(page, '西').click()
    await candidates(page).getByText('要', { exact: true }).click()
    await expect(page).toHaveURL(`/dictionary/search/${encodeURIComponent('要')}/?input=radicals`)
    await expect(radicalPanel(page, 'en')).toHaveCount(0)
    const leading = searchOrder('要').slice(0, fixtureLeadingEntries.要)
    await expect.poll(() => wordRowPaths(page)).toEqual(leading.map(word => decodeURI(word.path)))
    await expect(page.getByText(`${leading.length} word for 要`)).toBeVisible()
    await expect(
      page.getByRole('main').getByRole('textbox', { name: 'Search Japanese or English' })
    ).toHaveValue('要')
  })

  test('a kanji picked on a Japanese page joins the query and opens its Japanese search', async ({
    page
  }) => {
    await page.goto(localizedPath(`/dictionary/search/${encodeURIComponent('要')}/`, 'ja'))
    await openRadicalPanel(page, 'ja')
    await radical(page, '女', 'ja').click()
    await radical(page, '西', 'ja').click()
    await candidates(page, 'ja').getByText('腰', { exact: true }).click()
    await expect(page).toHaveURL(
      `/ja/dictionary/search/${encodeURIComponent('要腰')}/?input=radicals`
    )
  })

  test('opening the panel moves nothing on the page and draws no result again', async ({
    page
  }) => {
    const results = '/dictionary/search/iru/'
    await page.goto(results)
    const shown = 'main h1, main [data-result-row]'
    await page.evaluate(selector => {
      const watched = window as unknown as { shifts: number; drawn: Set<Element> }
      watched.shifts = 0
      watched.drawn = new Set(document.querySelectorAll(selector))
      new PerformanceObserver(list => {
        watched.shifts += list.getEntries().length
      }).observe({ type: 'layout-shift' })
    }, shown)
    const places = () =>
      page.evaluate(
        selector =>
          [...document.querySelectorAll(selector)].map(element => {
            const { x, y, width, height } = element.getBoundingClientRect()
            return { x, y, width, height }
          }),
        shown
      )
    const before = await places()
    expect(before.length).toBeGreaterThan(1)
    const asked: string[] = []
    page.on('request', request => {
      asked.push(new URL(request.url()).pathname)
    })
    await openRadicalPanel(page, 'en')
    expect(await places()).toEqual(before)
    expect(
      await page.evaluate(selector => {
        const { drawn } = window as unknown as { drawn: Set<Element> }
        const now = [...document.querySelectorAll(selector)]
        return now.length === drawn.size && now.every(element => drawn.has(element))
      }, shown)
    ).toBe(true)
    expect(await page.evaluate(() => (window as unknown as { shifts: number }).shifts)).toBe(0)
    expect(asked).toContain('/dictionary/radicals.json')
    expect(asked).not.toContain(results)
  })
})
