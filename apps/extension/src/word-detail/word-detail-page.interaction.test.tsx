import { readFileSync } from 'node:fs'
import { examplesPerPage } from '@zenbu/dictionary-core/detail/examples'
import { meaningActions } from '@zenbu/dictionary-core/detail/meaning-actions'
import type { WordRows } from '@zenbu/dictionary-core/detail/rows'
import { wordDetail } from '@zenbu/dictionary-core/detail/word'
import { wordPath } from '@zenbu/dictionary-core/detail/word-path'
import {
  fixtureFormExamples,
  fixtureKanjiRows,
  fixtureWordRows
} from '@zenbu/dictionary-core/fixtures'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { DataState } from '../shared/data-state'
import { websiteOrigin } from '../shared/hosts'
import { type Settings, settingDefaults } from '../shared/settings'
import '../test/act-environment'
import { setDataState } from '../test/data-state'
import { fakeNotices } from '../test/notices'
import type { EntryPage } from './entry-page'
import { FullEntry } from './full-entry'
import { wordDetailLabels } from './labels'
import type { WordLookups } from './lookups'

const aids = vi.hoisted(() => ({ furigana: true, chosen: null as string[] | null }))

const settingsNow = (): Settings => ({
  ...settingDefaults,
  'readingAids.furigana': aids.furigana,
  'frequencyDictionaries.chosen': aids.chosen ?? settingDefaults['frequencyDictionaries.chosen']
})

vi.mock('../shared/dictionary-progress', async () => {
  const { fakeDictionaryProgress } = await import('../test/data-state')
  return fakeDictionaryProgress
})

vi.mock('../shared/dictionary', () => ({
  lookUpWord: (entSeq: number) => lookups.lookUpWord(entSeq),
  lookUpWordExamples: (entSeq: number, from: number) => lookups.lookUpWordExamples(entSeq, from),
  lookUpKanji: (character: string) => lookups.lookUpKanji(character),
  lookUpFormExamples: (form: string, from: number) => lookups.lookUpFormExamples(form, from),
  resolveWord: (headword: string, reading: string) => lookups.resolveWord(headword, reading)
}))

const entry = (entSeq: number) => fixtureWordRows.find(rows => rows.entry.entSeq === entSeq) ?? null
const firstPage = (rows: WordRows): WordRows => ({
  ...rows,
  examples: rows.examples.slice(0, examplesPerPage)
})

const lookups = {
  lookUpWord: vi.fn<WordLookups['lookUpWord']>(async entSeq => {
    const rows = entry(entSeq)
    return { type: 'word', rows: rows && firstPage(rows) }
  }),
  lookUpWordExamples: vi.fn<WordLookups['lookUpWordExamples']>(async (entSeq, from) => ({
    type: 'word-examples',
    rows: entry(entSeq)?.examples.slice(from, from + examplesPerPage) ?? []
  })),
  lookUpKanji: vi.fn<WordLookups['lookUpKanji']>(async character => ({
    type: 'kanji',
    rows: fixtureKanjiRows.find(rows => rows.kanji.character === character) ?? null,
    strokes: 'ready'
  })),
  lookUpFormExamples: vi.fn<WordLookups['lookUpFormExamples']>(async form => {
    const rows = fixtureFormExamples.get(form) ?? []
    return { type: 'form-examples', rows, listed: rows.length }
  }),
  resolveWord: vi.fn<WordLookups['resolveWord']>(async (headword, reading) => ({
    type: 'resolve',
    entSeq:
      fixtureWordRows.find(
        rows => rows.entry.headword === headword && rows.entry.reading === reading
      )?.entry.entSeq ?? null
  }))
}

const readingAidsCss = readFileSync(`${import.meta.dirname}/reading-aids.css`, 'utf8')
const hidingRules = readingAidsCss
  .slice(0, readingAidsCss.indexOf('@layer'))
  .replace(/^@reference.*$/m, '')

let root: Root
let container: HTMLDivElement
const clipboard = vi.fn<(text: string) => Promise<void>>(async () => undefined)
const share = vi.fn<(data: ShareData) => Promise<void>>(async () => undefined)
const back = vi.fn()
let notices = fakeNotices()

beforeEach(() => {
  vi.clearAllMocks()
  notices = fakeNotices()
  aids.furigana = true
  aids.chosen = null
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: clipboard },
    configurable: true
  })
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  document.head.innerHTML = `<style>${hidingRules}</style>`
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  act(() => setDataState(null))
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

async function show(first: EntryPage) {
  await act(async () =>
    root.render(
      <FullEntry
        first={first}
        settings={settingsNow()}
        notices={notices.notices}
        backLabel={backLabel}
        entryLabel={entryLabel}
        back={back}
        lookups={lookups}
      />
    )
  )
}

async function click(element: Element | null | undefined) {
  if (!element) throw new Error('Nothing to click')
  await act(async () => (element as HTMLElement).click())
}

async function openMenu(label: string) {
  const trigger = container.querySelector(`button[aria-label="${label}"]`)
  if (!trigger) throw new Error(`No menu named ${label}`)
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    ;(trigger as HTMLElement).click()
  })
}

const all = (selector: string, within: ParentNode = container) => [
  ...within.querySelectorAll<HTMLElement>(selector)
]
const named = (selector: string, text: string, within: ParentNode = container) =>
  all(selector, within).find(element => element.textContent?.includes(text))
const shown = (element: Element | null) =>
  element !== null && getComputedStyle(element).display !== 'none'
const backLabel = 'Back to the card'
const entryLabel = 'Full entry for 要る'
const top = () => container.querySelector<HTMLElement>('section[data-entry-page]:not([hidden])')
const opened = () =>
  all('section[data-entry-page]')
    .slice(1)
    .map(page => page.dataset.entryPage)
const toasted = async (text: string) => expect(await notices.lastNotice()).toBe(text)
const ready: DataState = { state: 'ready', release: '2026.10', bytes: 1, checkedAt: null }
const iru = 1546640

describe('Word Detail', () => {
  test('要る shows the top, then each section in the app’s order', async () => {
    await show({ page: 'word', entSeq: iru })
    expect(container.querySelector('h1')?.getAttribute('aria-label')).toBe('要る')
    expect(all('h1 rt [data-reading]').map(part => part.dataset.reading)).toEqual(['い'])
    expect(container.querySelector('button[data-opens-conjugations]')?.textContent).toContain(
      wordDetail(entry(iru) as WordRows).partOfSpeechRow
    )
    expect(all('[data-slot="card-title"]').map(title => title.textContent)).toEqual([
      'Meaning',
      'Frequency',
      'Kanji',
      'Examples'
    ])
  })

  test('Furigana off hides the furigana and shows the reading under the headword', async () => {
    await show({ page: 'word', entSeq: iru })
    expect(shown(container.querySelector('h1 rt'))).toBe(true)
    expect(shown(container.querySelector('[data-aid="reading"]'))).toBe(false)
    act(() => root.unmount())
    aids.furigana = false
    root = createRoot(container)
    await show({ page: 'word', entSeq: iru })
    expect(shown(container.querySelector('h1 rt'))).toBe(false)
    expect(container.querySelector('[data-aid="reading"]')?.textContent).toBe('いる')
    expect(shown(container.querySelector('[data-aid="reading"]'))).toBe(true)
  })

  test('要’s two entries are offered by reading, starting on the chosen one', async () => {
    await show({ page: 'word', entSeq: 2188720, entries: [1609600, 2188720] })
    const tabs = all('[role="tab"]')
    expect(tabs.map(tab => tab.textContent)).toEqual(['かなめ', 'よう'])
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    expect(container.querySelector('[data-aid="reading"]')?.textContent).toBe('よう')
    await click(tabs[0])
    expect(container.querySelector('[data-aid="reading"]')?.textContent).toBe('かなめ')
  })

  test('the part of speech opens the conjugation table, and a form opens its examples', async () => {
    await show({ page: 'word', entSeq: iru })
    await click(container.querySelector('button[data-opens-conjugations]'))
    const table = document.querySelector('[data-conjugation-table]')
    expect(table).not.toBeNull()
    await click(named('[data-conjugation-row]', '要らない', document))
    expect(opened()).toEqual(['form'])
    expect(lookups.lookUpFormExamples).toHaveBeenCalledExactlyOnceWith('要らない', 0)
    expect(top()?.querySelector('h1')?.textContent).toBe('要らない')
    expect(all('li[data-example]', top() ?? container).length).toBe(
      fixtureFormExamples.get('要らない')?.length
    )
  })

  test('Frequency follows the learner’s chosen dictionaries, in their order', async () => {
    const frequencyRows = () => all('[data-frequency-row]').map(row => row.dataset.frequencyRow)
    await show({ page: 'word', entSeq: iru })
    expect(frequencyRows()).toEqual(['JLPT', 'YouTube'])
    act(() => root.unmount())
    aids.chosen = ['zenbu.tubelex.youtube.ja.unidic-3.1', 'zenbu.jlpt.waller.levels']
    root = createRoot(container)
    await show({ page: 'word', entSeq: iru })
    expect(frequencyRows()).toEqual(['YouTube', 'JLPT'])
    act(() => root.unmount())
    aids.chosen = []
    root = createRoot(container)
    await show({ page: 'word', entSeq: iru })
    expect(named('[data-slot="card-title"]', 'Frequency')).toBeUndefined()
  })

  test('a meaning’s Speak reads it in the best English voice on this computer, at the app’s rate', async () => {
    const speak = vi.fn<(utterance: { text: string; lang: string }) => void>()
    const samantha = { name: 'Samantha', voiceURI: 'Samantha', lang: 'en-US', localService: true }
    const google = { ...samantha, name: 'Google US English', localService: false }
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak,
      getVoices: () => [google, samantha]
    })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = ''
        constructor(readonly text: string) {}
      }
    )
    await show({ page: 'word', entSeq: iru })
    await openMenu(wordDetailLabels.meaning.actions.replace('{number}', '1'))
    await click(named('[data-slot="dropdown-menu-item"]', 'Speak', document))
    expect(speak.mock.calls[0]?.[0]).toMatchObject({ lang: 'en-US', voice: samantha, rate: 0.82 })
    expect(speak.mock.calls[0]?.[0].text).toContain('need')
  })

  test('a meaning’s Speak in a browser that can’t speak says so', async () => {
    await show({ page: 'word', entSeq: iru })
    await openMenu(wordDetailLabels.meaning.actions.replace('{number}', '1'))
    await click(named('[data-slot="dropdown-menu-item"]', 'Speak', document))
    await toasted(wordDetailLabels.meaning.unsupported)
  })

  test('a meaning’s Copy writes the meaning to the clipboard', async () => {
    await show({ page: 'word', entSeq: iru })
    await openMenu(wordDetailLabels.meaning.actions.replace('{number}', '1'))
    const items = all('[data-slot="dropdown-menu-item"]', document)
    expect(items.map(item => item.textContent)).toEqual(['Speak', 'Copy'])
    await click(items[1])
    const [sense] = wordDetail(entry(iru) as WordRows).senses
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(
      meaningActions({ meaning: sense?.meaning ?? '', glosses: [], noteText: sense?.noteText })
        .copyText
    )
    await toasted(wordDetailLabels.meaning.copied)
  })

  test('Share and Copy Link give the word’s page on the website’s origin', async () => {
    await show({ page: 'word', entSeq: iru })
    const link = `${websiteOrigin}${encodeURI(wordPath(wordDetail(entry(iru) as WordRows)))}`
    await click(container.querySelector('button[aria-label="Share 要る"]'))
    expect(share.mock.calls[0]?.[0].url).toBe(link)
    await openMenu('More actions for 要る')
    await click(named('[data-slot="dropdown-menu-item"]', 'Copy Link', document))
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(link)
    expect(link.startsWith(websiteOrigin)).toBe(true)
  })

  test('Open on zenbujapanese.com opens the word’s page in a new tab', async () => {
    await show({ page: 'word', entSeq: iru })
    const label = wordDetailLabels.share.openOnWebsite
    expect(label).toBe('Open on zenbujapanese.com')
    const link = container.querySelector<HTMLAnchorElement>(`a[aria-label="${label}"]`)
    expect(link?.title).toBe(label)
    expect(link?.getAttribute('href')).toBe(
      `${websiteOrigin}/dictionary/%E8%A6%81%E3%82%8B-1546640/`
    )
    expect(link?.target).toBe('_blank')
    expect(link?.rel).toBe('noreferrer')
    expect(link?.querySelector('svg.lucide-external-link')).not.toBeNull()
    expect(
      link?.nextElementSibling?.querySelector('button[aria-label="Share 要る"]')
    ).not.toBeNull()
  })

  test('Share without a share sheet copies the link', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    await show({ page: 'word', entSeq: iru })
    await click(container.querySelector('button[aria-label="Share 要る"]'))
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(
      `${websiteOrigin}${encodeURI(wordPath(wordDetail(entry(iru) as WordRows)))}`
    )
    expect(share).not.toHaveBeenCalled()
    await toasted(wordDetailLabels.share.linkCopied)
  })

  test('Load More fetches the next page of examples', async () => {
    await show({ page: 'word', entSeq: iru })
    expect(all('li[data-example]').length).toBe(examplesPerPage)
    await click(named('button', wordDetailLabels.examples.more))
    expect(lookups.lookUpWordExamples).toHaveBeenCalledExactlyOnceWith(iru, examplesPerPage)
    expect(all('li[data-example]').length).toBe(entry(iru)?.examples.length)
  })

  test('Load More that fails offers Try again, which loads the next page', async () => {
    lookups.lookUpWordExamples.mockResolvedValueOnce({
      type: 'failed',
      reason: 'The worker stopped.'
    })
    await show({ page: 'word', entSeq: iru })
    await click(named('button', wordDetailLabels.examples.more))
    expect(all('li[data-example]').length).toBe(examplesPerPage)
    expect(named('button', wordDetailLabels.examples.more)).toBeUndefined()
    await click(named('button', wordDetailLabels.examples.retry))
    expect(lookups.lookUpWordExamples.mock.calls).toEqual([
      [iru, examplesPerPage],
      [iru, examplesPerPage]
    ])
    expect(all('li[data-example]').length).toBe(entry(iru)?.examples.length)
  })

  test('a word in an example sentence opens its Word Detail', async () => {
    await show({ page: 'word', entSeq: iru })
    await click(container.querySelector('li[data-example] button[data-opens="word:1323080"]'))
    expect(opened()).toEqual(['word'])
    expect(lookups.lookUpWord).toHaveBeenLastCalledWith(1323080)
  })

  test('いる’s Alternative Kanji row 居 opens the kanji’s page', async () => {
    await show({ page: 'word', entSeq: 1577980 })
    const section = named('[data-slot="card-title"]', 'Alternative kanji')?.closest(
      '[data-slot="card"]'
    )
    await click(section?.querySelector('button[data-opens="kanji:居"]'))
    expect(opened()).toEqual(['kanji'])
    expect(lookups.lookUpKanji).toHaveBeenCalledExactlyOnceWith('居')
    expect(top()?.querySelector('[data-lookup="not-found"]')?.textContent).toBe(
      wordDetailLabels.lookup.kanjiNotFound
    )
  })

  test('いる’s related word 有る, outside the dictionary, shows not-found', async () => {
    await show({ page: 'word', entSeq: 1577980 })
    await click(container.querySelector('button[data-opens="word:1296400"]'))
    expect(opened()).toEqual(['word'])
    expect(lookups.lookUpWord).toHaveBeenLastCalledWith(1296400)
    expect(top()?.querySelector('[data-lookup="not-found"]')?.textContent).toBe(
      wordDetailLabels.lookup.wordNotFound
    )
  })

  async function showWithoutTargets() {
    const rows = entry(1577980) as WordRows
    const relationships = rows.entry.relationships.map(row => ({ ...row, targetEntSeq: null }))
    lookups.lookUpWord.mockResolvedValueOnce({
      type: 'word',
      rows: { ...rows, entry: { ...rows.entry, relationships } }
    })
    await show({ page: 'word', entSeq: 1577980 })
    return container.querySelector('button[data-opens="spelling:有る|ある"]')
  }

  test('a related word with no target is resolved by its spelling first', async () => {
    await click(await showWithoutTargets())
    expect(lookups.resolveWord).toHaveBeenCalledExactlyOnceWith('有る', 'ある')
    expect(opened()).toEqual([])
    await toasted('有る isn’t in the dictionary.')
  })

  test('a related word its spelling resolves opens that word', async () => {
    lookups.resolveWord.mockResolvedValueOnce({ type: 'resolve', entSeq: iru })
    await click(await showWithoutTargets())
    expect(opened()).toEqual(['word'])
    expect(top()?.querySelector('h1')?.getAttribute('aria-label')).toBe('要る')
  })

  test('a related word the dictionary can’t resolve says so', async () => {
    lookups.resolveWord.mockResolvedValueOnce({ type: 'failed', reason: 'The worker stopped.' })
    await click(await showWithoutTargets())
    expect(opened()).toEqual([])
    await toasted(wordDetailLabels.lookup.failed)
  })

  test('a word page waiting for the dictionary asks again once its data is ready', async () => {
    lookups.lookUpWord.mockResolvedValueOnce({
      type: 'not-ready',
      data: { state: 'downloading', done: 1, total: 4 }
    })
    await show({ page: 'word', entSeq: iru })
    expect(container.querySelector('[data-progress="downloading"]')).not.toBeNull()
    await act(async () => setDataState(ready))
    expect(lookups.lookUpWord).toHaveBeenCalledTimes(2)
    expect(container.querySelector('h1')?.getAttribute('aria-label')).toBe('要る')
  })
})

describe('The full entry’s pages', () => {
  const visible = (selector: string) =>
    all(selector).filter(element => !element.closest('[hidden]'))
  const headword = () => visible('h1[aria-label]').map(title => title.getAttribute('aria-label'))
  const backButton = () => named('button', backLabel, top() ?? container)
  const goBack = () => click(backButton())
  const scroller = () => top()?.querySelector(`section[aria-label="${entryLabel}"]`)

  test('Back returns through the pages each link opened, each as it was left, then leaves', async () => {
    await show({ page: 'word', entSeq: iru })
    expect(headword()).toEqual(['要る'])
    await click(visible('button[data-opens="kanji:要"]')[0])
    expect(visible('[data-kanji-details="要"]')).toHaveLength(1)
    expect(document.activeElement).toBe(scroller())
    await click(visible('button[data-opens="word:1546680"]')[0])
    expect(headword()).toEqual(['要求'])
    await goBack()
    expect(visible('[data-kanji-details="要"]')).toHaveLength(1)
    expect(document.activeElement).toBe(scroller())
    expect(lookups.lookUpKanji).toHaveBeenCalledOnce()
    await goBack()
    expect(headword()).toEqual(['要る'])
    expect(lookups.lookUpWord.mock.calls).toEqual([[iru], [1546680]])
    expect(back).not.toHaveBeenCalled()
    await goBack()
    expect(back).toHaveBeenCalledOnce()
  })
})
