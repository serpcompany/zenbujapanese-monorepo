import { noFormExamplesMessage } from '@zenbu/dictionary-core/detail/examples'
import { kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import type { KanjiRows } from '@zenbu/dictionary-core/detail/rows'
import { fixtureFormExamples, fixtureKanjiRows } from '@zenbu/dictionary-core/fixtures'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FormExamplesAnswer, KanjiAnswer } from '../shared/answers'
import type { DataState } from '../shared/data-state'
import type { Lookup } from '../shared/dictionary'
import { settingDefaults } from '../shared/settings'
import '../test/act-environment'
import { setDataState } from '../test/data-state'
import { fakeNotices, WithNotices } from '../test/notices'
import { FormExamplesPage } from './form-examples-page'
import { KanjiDetailPage } from './kanji-detail-page'
import { wordDetailLabels } from './labels'
import type { WordLookups } from './lookups'

vi.mock('../shared/dictionary-progress', async () => {
  const { fakeDictionaryProgress } = await import('../test/data-state')
  return fakeDictionaryProgress
})

const kaname = fixtureKanjiRows.find(rows => rows.kanji.character === '要') as KanjiRows
const ready: DataState = { state: 'ready', release: '2026.10', bytes: 1, checkedAt: null }
const downloading: DataState = { state: 'downloading', done: 1, total: 4 }
const notAsked = vi.fn(async () => ({ type: 'failed', reason: 'Not asked.' }) as const)

const sentencesUsing = (form: string): FormExamplesAnswer => {
  const rows = fixtureFormExamples.get(form) ?? []
  return { type: 'form-examples', rows, listed: rows.length }
}

const answering = (kanji: () => Lookup<KanjiAnswer>): WordLookups => ({
  lookUpWord: notAsked,
  lookUpWordExamples: notAsked,
  lookUpKanji: vi.fn(kanji),
  lookUpFormExamples: vi.fn(async (form: string) => sentencesUsing(form)),
  resolveWord: notAsked
})

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) act(unmount)
  act(() => setDataState(null))
  document.body.replaceChildren()
})

async function draw(page: ReactNode) {
  const element = document.body.appendChild(document.createElement('main'))
  const root = createRoot(element)
  mounted.push(() => root.unmount())
  await act(async () =>
    root.render(<WithNotices notices={fakeNotices().notices}>{page}</WithNotices>)
  )
  return element
}

const kanjiPage = (lookups: WordLookups) =>
  draw(
    <KanjiDetailPage
      page={{ page: 'kanji', character: '要' }}
      open={vi.fn()}
      settings={settingDefaults}
      lookups={lookups}
    />
  )

describe('Kanji detail', () => {
  it('shows 要’s readings, meanings and stroke order', async () => {
    const page = await kanjiPage(
      answering(async () => ({ type: 'kanji', rows: kaname, strokes: 'ready' }))
    )
    const detail = kanjiDetail(kaname)
    expect(page.querySelector('[data-kanji-details="要"]')).not.toBeNull()
    expect(page.textContent).toContain(detail.meanings.join(', '))
    expect([...page.querySelectorAll('h3')].map(title => title.textContent)).toContain('Readings')
    expect(page.querySelector('button[aria-label="Show stroke order for 要"]')).not.toBeNull()
    expect(page.querySelector('[data-strokes]')).toBeNull()
  })

  it('says stroke order is downloading while its strokes are', async () => {
    const page = await kanjiPage(
      answering(async () => ({
        type: 'kanji',
        rows: { ...kaname, strokes: null },
        strokes: 'downloading'
      }))
    )
    expect(page.querySelector('[data-strokes="downloading"]')?.textContent).toBe(
      wordDetailLabels.strokes.downloading
    )
    expect(page.querySelector('button[aria-label="Show stroke order for 要"]')).toBeNull()
    expect(page.querySelector('[data-kanji-details="要"]')).not.toBeNull()
  })

  it('asks again when the data changes, and shows stroke order once it has downloaded', async () => {
    const lookups = answering(async () => ({
      type: 'kanji',
      rows: { ...kaname, strokes: null },
      strokes: 'downloading'
    }))
    const page = await kanjiPage(lookups)
    vi.mocked(lookups.lookUpKanji).mockResolvedValueOnce({
      type: 'kanji',
      rows: kaname,
      strokes: 'ready'
    })
    await act(async () => setDataState(ready))
    expect(lookups.lookUpKanji).toHaveBeenCalledTimes(2)
    expect(page.querySelector('[data-strokes]')).toBeNull()
    expect(page.querySelector('button[aria-label="Show stroke order for 要"]')).not.toBeNull()
  })

  it('asks no more once its answer is whole', async () => {
    const lookups = answering(async () => ({ type: 'kanji', rows: kaname, strokes: 'ready' }))
    await kanjiPage(lookups)
    await act(async () => setDataState(ready))
    expect(lookups.lookUpKanji).toHaveBeenCalledTimes(1)
  })

  it('shows the dictionary’s progress while its data isn’t ready', async () => {
    const page = await kanjiPage(
      answering(async () => ({
        type: 'not-ready',
        data: { state: 'downloading', done: 1, total: 4 }
      }))
    )
    expect(page.querySelector('[data-progress="downloading"]')).not.toBeNull()
    expect(page.querySelector('[data-kanji-details]')).toBeNull()
  })

  it('moves its progress with the data, and shows the kanji once the data is ready', async () => {
    const lookups = answering(async () => ({ type: 'not-ready', data: downloading }))
    const page = await kanjiPage(lookups)
    vi.mocked(lookups.lookUpKanji).mockResolvedValueOnce({
      type: 'not-ready',
      data: { state: 'downloading', done: 3, total: 4 }
    })
    await act(async () => setDataState({ state: 'downloading', done: 3, total: 4 }))
    expect(lookups.lookUpKanji).toHaveBeenCalledTimes(2)
    expect(page.querySelector('[data-progress="downloading"]')).not.toBeNull()
    vi.mocked(lookups.lookUpKanji).mockResolvedValueOnce({
      type: 'kanji',
      rows: kaname,
      strokes: 'ready'
    })
    await act(async () => setDataState(ready))
    expect(lookups.lookUpKanji).toHaveBeenCalledTimes(3)
    expect(page.querySelector('[data-kanji-details="要"]')).not.toBeNull()
  })

  it('offers Try again after a failure, and asks again', async () => {
    const lookups = answering(async () => ({ type: 'failed', reason: 'The worker stopped.' }))
    const page = await kanjiPage(lookups)
    expect(page.querySelector('[data-lookup="failed"]')).not.toBeNull()
    vi.mocked(lookups.lookUpKanji).mockResolvedValueOnce({
      type: 'kanji',
      rows: kaname,
      strokes: 'ready'
    })
    await act(async () => page.querySelector('button')?.click())
    expect(lookups.lookUpKanji).toHaveBeenCalledTimes(2)
    expect(page.querySelector('[data-kanji-details="要"]')).not.toBeNull()
  })

  it('says a kanji outside the dictionary isn’t in it', async () => {
    const page = await kanjiPage(
      answering(async () => ({ type: 'kanji', rows: null, strokes: 'ready' }))
    )
    expect(page.querySelector('[data-lookup="not-found"]')?.textContent).toBe(
      wordDetailLabels.lookup.kanjiNotFound
    )
  })
})

describe('Form examples', () => {
  async function formPage(form: string, lookups = answering(notAsked)) {
    const element = await draw(
      <FormExamplesPage
        page={{ page: 'form', form }}
        open={vi.fn()}
        settings={settingDefaults}
        lookups={lookups}
      />
    )
    return { element, lookups }
  }

  it('lists the sentences that use いる, with a button to pronounce it', async () => {
    const { element, lookups } = await formPage('いる')
    expect(lookups.lookUpFormExamples).toHaveBeenCalledExactlyOnceWith('いる', 0)
    expect(element.querySelector('h1')?.textContent).toBe('いる')
    expect(element.querySelector('button[aria-label="Pronounce いる"]')).not.toBeNull()
    expect(element.querySelectorAll('li[data-example]')).toHaveLength(
      fixtureFormExamples.get('いる')?.length ?? -1
    )
  })

  it('says no sentence uses a form none does', async () => {
    const { element } = await formPage('要りませんでした')
    expect(element.querySelector('[data-examples="none"]')?.textContent).toBe(noFormExamplesMessage)
  })

  it('asks again once the data is ready', async () => {
    const lookups = answering(notAsked)
    vi.mocked(lookups.lookUpFormExamples).mockResolvedValueOnce({
      type: 'not-ready',
      data: downloading
    })
    const { element } = await formPage('いる', lookups)
    expect(element.querySelector('[data-progress="downloading"]')).not.toBeNull()
    await act(async () => setDataState(ready))
    expect(lookups.lookUpFormExamples).toHaveBeenCalledTimes(2)
    expect(element.querySelectorAll('li[data-example]')).toHaveLength(
      fixtureFormExamples.get('いる')?.length ?? -1
    )
  })
})
