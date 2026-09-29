// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { frequencyRowDetails } from '@/lib/dictionary/detail/frequency'
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
