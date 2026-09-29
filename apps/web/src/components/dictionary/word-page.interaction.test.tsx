// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { conjugations } from '@/lib/dictionary/detail/conjugation'
import { frequencyRowDetails } from '@/lib/dictionary/detail/frequency'
import { rubySegments } from '@/lib/dictionary/detail/ruby'
import { ConjugationTable } from './conjugations'
import { FrequencySection } from './frequency-section'
import { HeadwordRuby } from './headword-ruby'

// What selecting does on the word page, in a DOM: a headword kanji highlights itself and its part
// of the furigana, as the app's Furigana kanji highlight does, a Frequency row opens its details
// as a sheet, and the conjugation table's register control switches the forms its rows open.

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

/** Which kanji, and which furigana parts, are highlighted. */
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
    // 肉 and にく in 弱肉強食, the app docs' example.
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

describe('the conjugation table', () => {
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
            romaji: 'miru',
            readingWithoutFurigana: 'みる',
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
    // The address keeps the register, so returning from a Polite form shows Polite.
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
