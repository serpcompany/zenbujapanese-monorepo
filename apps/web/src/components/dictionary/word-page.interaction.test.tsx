import { conjugations } from '@zenbu/dictionary-core/detail/conjugation'
import { frequencyRowDetails } from '@zenbu/dictionary-core/detail/frequency'
import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ConjugationsButton, ConjugationTable } from './conjugations'
import { FrequencySection } from './frequency-section'
import { HeadwordRuby } from './headword-ruby'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  container = document.getElementById('root') as HTMLDivElement
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
})

const accent = 'text-blue-600'

function highlighted() {
  const kanji = [...container.querySelectorAll('button[data-kanji]')]
  const parts = [...container.querySelectorAll('rt span')]
  return {
    pressed: kanji
      .filter(button => button.getAttribute('aria-pressed') === 'true')
      .map(b => b.textContent),
    kanji: kanji.filter(button => button.className.includes(accent)).map(b => b.textContent),
    furigana: parts.filter(part => part.className.includes(accent)).map(part => part.textContent)
  }
}

function select(character: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button[data-kanji]')].find(
    candidate => candidate.textContent === character
  )
  if (!button) throw new Error(`No toggle for ${character}`)
  act(() => button.click())
}

describe('the headword’s kanji highlight', () => {
  test('selecting a kanji highlights it and its kana; again clears it, another moves it', () => {
    act(() =>
      root.render(
        <HeadwordRuby
          segments={[
            {
              text: '弱肉強食',
              reading: 'じゃくにくきょうしょく',
              kanjiReadings: ['じゃく', 'にく', 'きょう', 'しょく']
            }
          ]}
        />
      )
    )
    expect(highlighted()).toEqual({ pressed: [], kanji: [], furigana: [] })
    select('肉')
    expect(highlighted()).toEqual({ pressed: ['肉'], kanji: ['肉'], furigana: ['にく'] })
    select('食')
    expect(highlighted()).toEqual({ pressed: ['食'], kanji: ['食'], furigana: ['しょく'] })
    select('食')
    expect(highlighted()).toEqual({ pressed: [], kanji: [], furigana: [] })
  })

  test('々 highlights its own part of the reading (人々 is ひと・びと)', () => {
    act(() =>
      root.render(
        <HeadwordRuby
          segments={[{ text: '人々', reading: 'ひとびと', kanjiReadings: ['ひと', 'びと'] }]}
        />
      )
    )
    select('々')
    expect(highlighted()).toEqual({ pressed: ['々'], kanji: ['々'], furigana: ['びと'] })
  })
})

describe('the Frequency section', () => {
  test('selecting a row opens Frequency Details for that dictionary', async () => {
    const rows = frequencyRowDetails([
      { pack: 'jlpt', level: 5 },
      { pack: 'tubelex', rank: 949 }
    ])
    act(() => root.render(<FrequencySection rows={rows} />))
    expect(document.body.textContent).not.toContain('Frequency Details')
    const youtube = container.querySelector<HTMLButtonElement>('[data-frequency-row="YouTube"]')
    await act(async () => youtube?.click())
    const details = document.querySelector('[data-frequency-details]')
    expect(document.body.textContent).toContain('Frequency Details')
    expect(details?.querySelector('h3')?.textContent).toBe('YouTube')
    expect(details?.textContent).toContain('#949')
    expect(details?.textContent).toContain('Top 0.27%')
  })
})

describe('the conjugations sheet', () => {
  test('the part of speech opens it; Polite switches register; a row opens its form; Back returns', async () => {
    const data = conjugations(
      { headword: '見る', reading: 'みる', partsOfSpeech: ['ichidanVerb', 'transitive'] },
      new Map()
    )
    if (!data) throw new Error('見る has no table')
    const fetcher = vi.fn(async (_url: string) => Response.json({ examples: [] }))
    vi.stubGlobal('fetch', fetcher)
    act(() =>
      root.render(
        <ConjugationsButton
          word={{
            ruby: rubySegments('見る', 'みる'),
            reading: 'みる',
            summary: 'to see',
            partOfSpeech: 'Ichidan verb (transitive)',
            pitch: null
          }}
          conjugations={data}
          wordPath="/dictionary/見る-1259290/"
        />
      )
    )
    const click = async (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Nothing matches ${selector}`)
      await act(async () => element.click())
    }
    const surfaces = () =>
      [...document.querySelectorAll('[data-conjugation-surface]')].map(node => node.textContent)
    const pageLink = () =>
      decodeURI(document.querySelector('[data-conjugation-page-link]')?.getAttribute('href') ?? '')
    await click('[data-opens-conjugations]')
    expect(document.body.textContent).toContain('Conjugations')
    expect(surfaces().slice(0, 2)).toEqual(['見る', '見た'])
    expect(pageLink()).toBe('/dictionary/見る-1259290/conjugations/')
    await click('[data-conjugation-mode="Polite"]')
    expect(surfaces().slice(0, 2)).toEqual(['見ます', '見ました'])
    expect(pageLink()).toBe('/dictionary/見る-1259290/conjugations/#polite')
    await click('[data-conjugation-row="potential"]')
    expect(document.querySelector('[data-conjugated-form]')?.textContent).toContain(
      'Same spelling as Passive.'
    )
    expect(fetcher).toHaveBeenCalledWith(
      `/dictionary/conjugations/${encodeURIComponent('見られます')}.json`
    )
    expect(document.querySelector('[data-conjugation-examples]')?.textContent).toContain(
      'No example sentences use this form yet.'
    )
    expect(pageLink()).toBe('/dictionary/見る-1259290/conjugations/polite/potential/')
    await click('[aria-label="Back to conjugations"]')
    expect(document.querySelector('[data-conjugated-form]')).toBeNull()
    expect(surfaces()[0]).toBe('見ます')
    vi.unstubAllGlobals()
  })
})

describe('the conjugation table’s page', () => {
  const data = conjugations(
    { headword: '見る', reading: 'みる', partsOfSpeech: ['ichidanVerb', 'transitive'] },
    new Map()
  )
  const renderTable = () => {
    if (!data) throw new Error('見る has no table')
    act(() =>
      root.render(
        <ConjugationTable
          word={{
            ruby: rubySegments('見る', 'みる'),
            reading: 'みる',
            summary: 'to see',
            partOfSpeech: 'Ichidan verb (transitive)',
            pitch: null
          }}
          conjugations={data}
          wordPath="/dictionary/見る-1259290/"
        />
      )
    )
  }
  const rows = () =>
    [...document.querySelectorAll<HTMLAnchorElement>('[data-conjugation-row]')].map(row => ({
      surface: row.querySelector('[data-conjugation-surface]')?.textContent,
      href: decodeURI(row.getAttribute('href') ?? '')
    }))

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  test('Polite switches register, and each row opens its form in that register', async () => {
    renderTable()
    expect(rows().slice(0, 2)).toEqual([
      { surface: '見る', href: '/dictionary/見る-1259290/conjugations/plain/present-future/' },
      { surface: '見た', href: '/dictionary/見る-1259290/conjugations/plain/past/' }
    ])
    const polite = document.querySelector<HTMLElement>('[data-conjugation-mode="Polite"]')
    await act(async () => polite?.click())
    expect(rows().slice(0, 2)).toEqual([
      { surface: '見ます', href: '/dictionary/見る-1259290/conjugations/polite/present-future/' },
      { surface: '見ました', href: '/dictionary/見る-1259290/conjugations/polite/past/' }
    ])
    expect(window.location.hash).toBe('#polite')
  })

  test('the register goes into the address with null state, so the router keeps it', async () => {
    window.history.replaceState(
      { __NA: true, tree: [] },
      '',
      '/dictionary/見る-1259290/conjugations/'
    )
    const replace = vi.spyOn(window.history, 'replaceState')
    renderTable()
    const click = async (mode: string) => {
      const tab = document.querySelector<HTMLElement>(`[data-conjugation-mode="${mode}"]`)
      await act(async () => tab?.click())
    }
    await click('Polite')
    expect(replace).toHaveBeenLastCalledWith(
      null,
      '',
      `${encodeURI('/dictionary/見る-1259290/conjugations/')}#polite`
    )
    expect(window.history.state).toBeNull()
    expect(window.location.hash).toBe('#polite')
    await click('Plain')
    expect(replace).toHaveBeenLastCalledWith(
      null,
      '',
      encodeURI('/dictionary/見る-1259290/conjugations/')
    )
    expect(window.location.hash).toBe('')
    replace.mockRestore()
  })

  test('opens in Polite when the address names it, as Back from a Polite form does', () => {
    window.history.replaceState(null, '', '/dictionary/見る-1259290/conjugations/#polite')
    renderTable()
    expect(rows()[0].surface).toBe('見ます')
  })
})
