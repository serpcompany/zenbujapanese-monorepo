import { noFormExamplesMessage } from '@zenbu/dictionary-core/detail/examples'
import { kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import type { KanjiRows } from '@zenbu/dictionary-core/detail/rows'
import { fixtureFormExamples, fixtureKanjiRows } from '@zenbu/dictionary-core/fixtures'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataState } from '../shared/data-state'
import type { FormExamplesAnswer, KanjiAnswer, Lookup } from '../shared/dictionary'
import { pages } from '../side-panel/pages'
import { FormExamplesPage } from './form-examples-page'
import { KanjiDetailPage } from './kanji-detail-page'
import { wordDetailLabels } from './labels'
import type { WordLookups } from './lookups'
import { WordDetailPage } from './word-detail-page'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../shared/dictionary-progress', () => ({
  DictionaryProgress: ({ data }: { data: DataState }) => <p data-progress={data.state} />
}))

const kaname = fixtureKanjiRows.find(rows => rows.kanji.character === '要') as KanjiRows
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
  document.body.replaceChildren()
})

async function kanjiPage(lookups: WordLookups) {
  const element = document.body.appendChild(document.createElement('main'))
  const root = createRoot(element)
  mounted.push(() => root.unmount())
  await act(async () =>
    root.render(
      <KanjiDetailPage page={{ page: 'kanji', character: '要' }} open={vi.fn()} lookups={lookups} />
    )
  )
  return element
}

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
  async function formPage(form: string) {
    const element = document.body.appendChild(document.createElement('main'))
    const root = createRoot(element)
    mounted.push(() => root.unmount())
    const lookups = answering(notAsked)
    await act(async () =>
      root.render(
        <FormExamplesPage page={{ page: 'form', form }} open={vi.fn()} lookups={lookups} />
      )
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
})

describe('The side panel’s pages', () => {
  it('draws a word, a kanji, and a form with Word Detail’s pages', () => {
    expect(pages).toMatchObject({
      word: WordDetailPage,
      kanji: KanjiDetailPage,
      form: FormExamplesPage
    })
  })
})
