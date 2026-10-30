import type { KanjiRows } from '@zenbu/dictionary-core/detail/rows'
import { fixtureKanjiRows } from '@zenbu/dictionary-core/fixtures'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KanjiAnswer } from '../shared/answers'
import type { DataState } from '../shared/data-state'
import { readDataState } from '../shared/dictionary'
import { settingDefaults } from '../shared/settings'
import '../test/act-environment'
import { fakeNotices, WithNotices } from '../test/notices'
import { KanjiDetailPage } from './kanji-detail-page'
import type { WordLookups } from './lookups'

vi.mock('../shared/dictionary', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared/dictionary')>()),
  readDataState: vi.fn()
}))

const kaname = fixtureKanjiRows.find(rows => rows.kanji.character === '要') as KanjiRows
const ready: DataState = { state: 'ready', release: '2026.10.1', bytes: 1, checkedAt: null }
const notAsked = vi.fn(async () => ({ type: 'failed', reason: 'Not asked.' }) as const)

const mounted: (() => void)[] = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(readDataState).mockImplementation(async () => ({ type: 'state', data: { ...ready } }))
})

afterEach(() => {
  for (const unmount of mounted.splice(0)) act(unmount)
  document.body.replaceChildren()
  vi.useRealTimers()
})

async function kanjiPage() {
  let strokes: KanjiAnswer['strokes'] = 'downloading'
  const lookUpKanji = vi.fn(
    async (): Promise<KanjiAnswer> =>
      strokes === 'ready'
        ? { type: 'kanji', rows: kaname, strokes }
        : { type: 'kanji', rows: { ...kaname, strokes: null }, strokes }
  )
  const lookups: WordLookups = {
    lookUpWord: notAsked,
    lookUpWordExamples: notAsked,
    lookUpKanji,
    lookUpFormExamples: notAsked,
    resolveWord: notAsked
  }
  const element = document.body.appendChild(document.createElement('main'))
  const root = createRoot(element)
  mounted.push(() => root.unmount())
  await act(async () =>
    root.render(
      <WithNotices notices={fakeNotices().notices}>
        <KanjiDetailPage
          page={{ page: 'kanji', character: '要' }}
          open={vi.fn()}
          settings={settingDefaults}
          lookups={lookups}
        />
      </WithNotices>
    )
  )
  await act(async () => vi.advanceTimersByTimeAsync(3000))
  expect(element.querySelector('[data-strokes="downloading"]')).not.toBeNull()
  const land = () => {
    strokes = 'ready'
  }
  return { element, lookUpKanji, land }
}

async function expectNoMoreAsking(lookUpKanji: ReturnType<typeof vi.fn>) {
  const asked = lookUpKanji.mock.calls.length
  const polls = vi.mocked(readDataState).mock.calls.length
  await act(async () => vi.advanceTimersByTimeAsync(3000))
  expect(lookUpKanji.mock.calls.length).toBe(asked)
  expect(vi.mocked(readDataState).mock.calls.length).toBe(polls)
}

describe('a kanji page opened while the strokes download', () => {
  it('shows stroke order once the strokes land, though the data stays ready', async () => {
    const { element, lookUpKanji, land } = await kanjiPage()

    land()
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(element.querySelector('[data-strokes]')).toBeNull()
    expect(element.querySelector('button[aria-label="Show stroke order for 要"]')).not.toBeNull()
    await expectNoMoreAsking(lookUpKanji)
  })

  it.each<[string, DataState]>([
    ['the update failed', { ...ready, updateFailed: 'Failed to fetch' }],
    ['the data failed', { state: 'failed', reason: 'Failed to fetch' }]
  ])('stops asking when %s, since the strokes will not land', async (_, failed) => {
    const { lookUpKanji } = await kanjiPage()

    vi.mocked(readDataState).mockImplementation(async () => ({ type: 'state', data: failed }))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    await expectNoMoreAsking(lookUpKanji)
  })
})
