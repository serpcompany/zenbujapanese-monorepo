import { conjugations } from '@zenbu/dictionary-core/detail/conjugation'
import { formExample } from '@zenbu/dictionary-core/detail/examples'
import { frequencyRowDetails } from '@zenbu/dictionary-core/detail/frequency'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { pageExample } from '@/lib/dictionary/page-example'
import { ConjugationsLink, ConjugationsSection } from './conjugations'
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

describe('the Conjugations section', () => {
  const miru = conjugations(
    { headword: '見る', reading: 'みる', partsOfSpeech: ['ichidanVerb', 'transitive'] },
    new Map()
  )
  const wordPath = '/dictionary/見る-1259290/'

  const renderSection = () => {
    if (!miru) throw new Error('見る has no table')
    act(() =>
      root.render(
        <>
          <ConjugationsLink partOfSpeech="Ichidan verb (transitive)" />
          <ConjugationsSection conjugations={miru} />
        </>
      )
    )
  }

  const element = <Found extends HTMLElement>(selector: string) => {
    const found = document.querySelector<Found>(selector)
    if (!found) throw new Error(`Nothing matches ${selector}`)
    return found
  }
  const click = async (selector: string) => {
    const target = element(selector)
    await act(async () => target.click())
  }
  const sectionButton = '#conjugations h2 button'
  const isOpen = (button: string) => element(button).getAttribute('aria-expanded') === 'true'
  const shownSurfaces = () =>
    [
      ...document.querySelectorAll(
        '[data-conjugation-rows]:not([hidden]) [data-conjugation-surface]'
      )
    ].map(node => node.textContent)
  const rowButton = (kind: string, mode = 'Plain') =>
    `[data-conjugation-rows="${mode}"] [data-conjugation-row="${kind}"] > button`

  const examplesFetch = (answer: () => Promise<Response>) => {
    const fetcher = vi.fn(async (_url: string) => answer())
    vi.stubGlobal('fetch', fetcher)
    return fetcher
  }

  beforeEach(() => {
    window.history.replaceState(null, '', wordPath)
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.unstubAllGlobals()
  })

  test('starts closed, and opens when the address names it', () => {
    renderSection()
    expect(isOpen(sectionButton)).toBe(false)
    act(() => root.unmount())
    root = createRoot(container)
    window.history.replaceState(null, '', `${wordPath}#conjugations`)
    renderSection()
    expect(isOpen(sectionButton)).toBe(true)
  })

  test('the part of speech opens it, and opens it again once it is closed', async () => {
    renderSection()
    expect(element('[data-opens-conjugations]').getAttribute('href')).toBe('#conjugations')
    await click('[data-opens-conjugations]')
    expect(window.location.hash).toBe('#conjugations')
    expect(isOpen(sectionButton)).toBe(true)
    await click(sectionButton)
    expect(isOpen(sectionButton)).toBe(false)
    await click('[data-opens-conjugations]')
    expect(isOpen(sectionButton)).toBe(true)
  })

  test('Polite switches register, and the other register stays in the page, hidden', async () => {
    renderSection()
    await click(sectionButton)
    expect(shownSurfaces().slice(0, 2)).toEqual(['見る', '見た'])
    expect(element('[data-conjugation-rows="Polite"]').hidden).toBe(true)
    await click('[data-conjugation-mode="Polite"]')
    expect(shownSurfaces().slice(0, 2)).toEqual(['見ます', '見ました'])
    expect(element('[data-conjugation-rows="Plain"]').hidden).toBe(true)
    expect(document.querySelectorAll('[data-conjugation-rows="Plain"] li')).toHaveLength(
      miru?.rows.Plain.length ?? 0
    )
    expect(window.location.hash).toBe('')
  })

  test('a row opens its form, which loads its examples once, from the JSON route', async () => {
    const fetcher = examplesFetch(async () => Response.json({ examples: [] }))
    renderSection()
    await click(sectionButton)
    await click('[data-conjugation-mode="Polite"]')
    const potential = rowButton('potential', 'Polite')
    expect(element(potential).getAttribute('aria-label')).toBe('Potential, 見られます, みられます')
    expect(fetcher).not.toHaveBeenCalled()
    await click(potential)
    expect(isOpen(potential)).toBe(true)
    const form = element('[data-conjugation-rows="Polite"] [data-conjugated-form="potential"]')
    expect(form.textContent).toContain('Same spelling as Passive.')
    expect(fetcher).toHaveBeenCalledWith(
      `/dictionary/conjugations/${encodeURIComponent('見られます')}.json`
    )
    const examples = element('[data-conjugation-rows="Polite"] [data-conjugation-examples]')
    expect(examples.dataset.conjugationExamples).toBe('loaded')
    expect(examples.textContent).toContain('No example sentences use this form yet.')
    await click(potential)
    expect(isOpen(potential)).toBe(false)
    await click(potential)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('an opened form lists the examples its route returns', async () => {
    const example = pageExample(
      formExample({
        sentence: {
          id: 7,
          pairId: '0'.repeat(32),
          japanese: '見た。',
          english: 'I saw it.',
          tokens: [{ text: '見た', reading: 'みた', dictionaryForm: '見る' }, { text: '。' }],
          japaneseTatoebaId: 1,
          japaneseContributor: null,
          japaneseLicense: 'CC BY 2.0 FR',
          englishTatoebaId: 2,
          englishContributor: null,
          englishLicense: 'CC BY 2.0 FR'
        },
        example: { surface: '見た', position: 0, sentenceId: 7, highlights: [0], links: [] }
      }),
      { word: () => null, kanji: () => null }
    )
    examplesFetch(async () => Response.json({ examples: [example] }))
    renderSection()
    await click(rowButton('past'))
    const examples = element('[data-conjugation-rows="Plain"] [data-conjugation-examples]')
    expect(examples.textContent).toContain('I saw it.')
    expect(examples.textContent).not.toContain('No example sentences use this form yet.')
  })

  test('a form says so when its examples can’t load', async () => {
    examplesFetch(async () => new Response('{}', { status: 503 }))
    renderSection()
    await click(rowButton('past'))
    const examples = element('[data-conjugation-rows="Plain"] [data-conjugation-examples]')
    expect(examples.dataset.conjugationExamples).toBe('failed')
    expect(examples.textContent).toContain('Examples couldn’t load. Try again later.')
  })
})
