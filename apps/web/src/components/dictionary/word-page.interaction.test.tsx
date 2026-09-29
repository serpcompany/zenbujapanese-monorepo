// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { conjugations } from '@/lib/dictionary/detail/conjugation'
import { frequencyRowDetails } from '@/lib/dictionary/detail/frequency'
import { rubySegments } from '@/lib/dictionary/detail/ruby'
import { ConjugationsButton } from './conjugations'
import { FrequencySection } from './frequency-section'
import { HeadwordRuby } from './headword-ruby'

// What selecting does on the word page, in a DOM: a headword kanji highlights itself and its part
// of the furigana, as the app's Furigana kanji highlight does, and a Frequency row opens its
// details as a sheet.

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
  test('the part of speech opens it; Polite switches register; a row opens its form; Back returns', async () => {
    const data = conjugations(
      { headword: '見る', reading: 'みる', partsOfSpeech: ['ichidanVerb', 'transitive'] },
      new Map()
    )
    if (!data) throw new Error('見る has no table')
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
    await click('[data-opens-conjugations]')
    expect(document.body.textContent).toContain('Conjugations')
    expect(surfaces().slice(0, 2)).toEqual(['見る', '見た'])
    await click('[data-conjugation-mode="Polite"]')
    expect(surfaces().slice(0, 2)).toEqual(['見ます', '見ました'])
    await click('[data-conjugation-row="potential"]')
    expect(document.querySelector('[data-conjugated-form]')?.textContent).toContain(
      'Same spelling as Passive.'
    )
    await click('[aria-label="Back to conjugations"]')
    expect(document.querySelector('[data-conjugated-form]')).toBeNull()
    // Back keeps the register the reader chose.
    expect(surfaces()[0]).toBe('見ます')
  })
})
