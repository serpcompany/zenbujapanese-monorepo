import { fixtureRadicals } from '@zenbu/dictionary-core/fixtures'
import { RadicalLookup } from '@zenbu/dictionary-core/search/radicals'
import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { SearchForm } from './search-form'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const lookup = new RadicalLookup(fixtureRadicals)
const text = getDictionary('en').searchForm.radicals
const fetched: string[] = []
let answer: () => Response = () => Response.json(fixtureRadicals)
let root: Root

const stayOnThePage = (event: MouseEvent) => event.preventDefault()

beforeAll(async () => {
  await import('./radical-panel')
})

beforeEach(() => {
  fetched.length = 0
  answer = () => Response.json(fixtureRadicals)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url)
      return answer()
    })
  )
  window.localStorage.clear()
  document.addEventListener('click', stayOnThePage, true)
  root = createRoot(document.body.appendChild(document.createElement('div')))
})

afterEach(() => {
  act(() => root.unmount())
  document.removeEventListener('click', stayOnThePage, true)
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const shownPanel = () => document.querySelector('[data-radical-panel]')

async function untilLoaded(locale: Locale) {
  const loading = getDictionary(locale).searchForm.radicals.loading
  for (let tick = 0; tick < 100; tick++) {
    if (!shownPanel()?.textContent?.includes(loading)) return
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)))
  }
  throw new Error('The radical panel kept loading')
}

async function openPanel(locale: Locale = 'en', defaultValue?: string) {
  act(() =>
    root.render(
      <SearchForm
        locale={locale}
        text={getDictionary(locale).searchForm}
        defaultValue={defaultValue}
      />
    )
  )
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${getDictionary(locale).searchForm.radicals.open}"]`
  )
  if (!button) throw new Error('The search box has no radicals button')
  await act(async () => button.click())
  await untilLoaded(locale)
  const panel = shownPanel()
  if (!panel) throw new Error('The radicals button opened no panel')
  return panel
}

const radical = (glyph: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="Radical ${glyph}"]`)

const offeredRadicals = () =>
  [
    ...document.querySelectorAll<HTMLButtonElement>('[data-radical-panel] button[aria-pressed]')
  ].map(button => button.textContent)

const candidates = () => [
  ...document.querySelectorAll<HTMLAnchorElement>(`ul[aria-label="${text.candidates}"] a`)
]

const buttonSaying = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    button => button.textContent === label
  )

const headings = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    '[data-radical-panel] [data-slot="accordion-trigger"]'
  )
]

async function press(button: HTMLButtonElement | null | undefined) {
  if (!button) throw new Error('No such button')
  await act(async () => button.click())
}

const glyphs = (selected: string[]) =>
  lookup.panel(selected).groups.flatMap(group => group.radicals.map(({ glyph }) => glyph))

describe('the radical panel', () => {
  test('the first time it opens on a page, says so when the radicals can’t load, and tries again', async () => {
    answer = () => new Response('{}', { status: 503 })
    const panel = await openPanel()
    expect(panel.textContent).toContain(text.unavailable)
    answer = () => Response.json(fixtureRadicals)
    await press(buttonSaying(text.retry))
    await untilLoaded('en')
    expect(fetched).toEqual(['/dictionary/radicals.json', '/dictionary/radicals.json'])
    expect(offeredRadicals()).toEqual(glyphs([]))
  })

  test('opens from the search box with every radical under its stroke count, and the prompt', async () => {
    const panel = await openPanel()
    expect(panel.textContent).toContain(text.prompt)
    expect(candidates()).toEqual([])
    expect(offeredRadicals()).toEqual(glyphs([]))
    expect(headings().map(heading => heading.textContent)).toEqual(
      lookup.panel([]).groups.map(group => group.label)
    )
    expect(buttonSaying(text.undo)?.disabled).toBe(true)
    const credited = [...panel.querySelectorAll('a')].map(link => link.getAttribute('href'))
    expect(credited).toEqual([sourceCredits.radkfile.url, sourceCredits.radkfile.license.url])
  })

  test('lists the kanji holding every radical picked, fewest others first, and hides radicals that no longer combine', async () => {
    await openPanel()
    await press(radical('女'))
    expect(radical('女')?.getAttribute('aria-pressed')).toBe('true')
    expect(candidates().map(link => link.textContent)).toEqual(lookup.panel(['女']).candidates)
    expect(offeredRadicals()).toEqual(glyphs(['女']))
    expect(offeredRadicals().length).toBeLessThan(glyphs([]).length)
    await press(radical('西'))
    expect(candidates().map(link => link.textContent)).toEqual(['要', '腰', '嫖'])
    expect(lookup.panel(['女', '西']).candidates).toEqual(['要', '腰', '嫖'])
    expect(offeredRadicals()).toEqual(glyphs(['女', '西']))
  })

  test('Undo takes back the last radical picked, and pressing a radical again unpicks it', async () => {
    await openPanel()
    await press(radical('女'))
    await press(radical('西'))
    await press(buttonSaying(text.undo))
    expect(candidates().map(link => link.textContent)).toEqual(lookup.panel(['女']).candidates)
    await press(radical('女'))
    expect(candidates()).toEqual([])
    expect(offeredRadicals()).toEqual(glyphs([]))
    expect(buttonSaying(text.undo)?.disabled).toBe(true)
  })

  test('a kanji is added to the end of the query, searched as picked, and the panel closes', async () => {
    await openPanel('en', '日')
    await press(radical('女'))
    await press(radical('西'))
    const [first] = candidates()
    expect(first.getAttribute('href')).toBe(
      `/dictionary/search/${encodeURIComponent('日要')}/?input=radicals`
    )
    await act(async () => first.click())
    expect(document.querySelector<HTMLInputElement>('input[name="q"]')?.value).toBe('日要')
    await untilClosed()
    expect(shownPanel()).toBeNull()
    expect(window.sessionStorage.getItem('search.asked')).toBeNull()
  })

  test("a pick is a search the learner asked for, kept for a signed-in learner's Recent searches", async () => {
    vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'open')
    vi.stubEnv('ZENBU_ACCOUNT_SERVICE', 'https://api.example.com')
    window.localStorage.setItem('zenbu-signed-in', 'yes')
    try {
      await openPanel('en', '日')
      await press(radical('女'))
      await press(radical('西'))
      await act(async () => candidates()[0]?.click())
      expect(window.sessionStorage.getItem('search.asked')).toBe('日要')
    } finally {
      vi.unstubAllEnvs()
      window.sessionStorage.clear()
    }
  })

  test('opens fresh each time, without loading again, and keeps the stroke counts the learner closed', async () => {
    await openPanel()
    await press(radical('女'))
    const [firstHeading] = headings()
    await press(firstHeading)
    expect(firstHeading.getAttribute('aria-expanded')).toBe('false')
    act(() => root.unmount())
    root = createRoot(document.body.appendChild(document.createElement('div')))
    await openPanel()
    expect(candidates()).toEqual([])
    expect(headings()[0].getAttribute('aria-expanded')).toBe('false')
    expect(fetched).toEqual([])
  })

  test('names its stroke counts and radicals in Japanese on a Japanese page', async () => {
    const panel = await openPanel('ja')
    const ja = getDictionary('ja').searchForm.radicals
    expect(headings()[0].textContent).toBe(coreText(lookup.panel([]).groups[0].label, 'ja'))
    expect(panel.textContent).toContain(ja.prompt)
    const named = ja.radical.replace('{glyph}', '女')
    expect(document.querySelector(`button[aria-label="${named}"]`)).not.toBeNull()
  })
})

async function untilClosed() {
  for (let tick = 0; tick < 100; tick++) {
    if (!shownPanel()) return
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)))
  }
}
