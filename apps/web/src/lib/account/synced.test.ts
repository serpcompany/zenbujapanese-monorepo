import { describe, expect, test, vi } from 'vitest'
import { getDictionary } from '@/lib/i18n/dictionary'
import { refusedResult } from '@/test/account-answers'
import type { Result } from './client'
import { photoQueue } from './photo-queue'
import { syncedAreaAt, syncedAreaNames } from './synced'
import { kindPageOf, mutationResultsOf } from './synced-answers'
import {
  itemName,
  itemPath,
  listPath,
  matchesTyped,
  packName,
  settingName,
  settingValue,
  shownDuration
} from './synced-views'

const words = getDictionary('en').account.synced
const put = { entity: 'list', entityId: 'a', operation: 'put', version: 2, data: { name: 'Food' } }
const removed = { entity: 'list', entityId: 'b', operation: 'delete', version: 3, data: null }

describe("the account's answers to a page of synced data", () => {
  test('take a page of puts and deletes, and refuse one in any other shape', () => {
    expect(kindPageOf({ changes: [put, removed], cursor: 'c', hasMore: false })).toEqual({
      changes: [put, removed],
      cursor: 'c',
      hasMore: false
    })
    for (const change of [
      { ...put, data: null },
      { ...removed, data: {} },
      { ...put, operation: 'patch' },
      { ...put, version: -1 },
      { ...put, version: 1.5 },
      { ...put, entityId: 7 }
    ]) {
      expect(kindPageOf({ changes: [change], cursor: 'c', hasMore: false })).toBeNull()
    }
    expect(kindPageOf({ changes: [], hasMore: false })).toBeNull()
    expect(kindPageOf({ changes: [], cursor: 'c' })).toBeNull()
  })

  test("take each change's result, and refuse an answer with one in no known shape", () => {
    const results = [
      { id: '1', status: 'applied', version: 2 },
      { id: '2', status: 'conflict', version: 3, current: put },
      { id: '3', status: 'rejected', error: { code: 'unknown_list', message: 'Gone.' } }
    ]
    expect(mutationResultsOf({ results })).toEqual(results)
    for (const result of [
      { id: '1', status: 'applied' },
      { id: '2', status: 'conflict', version: 3 },
      { id: '3', status: 'rejected', error: {} },
      { id: '4', status: 'queued' }
    ]) {
      expect(mutationResultsOf({ results: [result] })).toBeNull()
    }
  })
})

describe('what the pages show of the account', () => {
  test('a page for each kind, at its own path', () => {
    expect(syncedAreaNames.map(area => [area, syncedAreaAt(area)])).toHaveLength(8)
    expect(syncedAreaAt('known-words')).toBe('knownWords')
    expect(syncedAreaAt('media-library')).toBe('mediaLibrary')
    expect(syncedAreaAt('profile')).toBeNull()
    expect(listPath('2177c773', 'ja')).toBe('/ja/account/lists/?list=2177c773')
  })

  test('a word links to its search, a kanji to its own, in the page’s language', () => {
    const word = { itemId: 'a'.repeat(32), headword: '見る', reading: 'みる' }
    expect(itemPath(word.itemId, word.headword, 'en')).toBe(
      '/dictionary/search/%E8%A6%8B%E3%82%8B/'
    )
    expect(itemPath('kanji:日', '日', 'ja')).toBe('/ja/dictionary/search/%E6%97%A5/')
    expect(itemPath(word.itemId, '', 'en')).toBeNull()
    expect(itemName(word)).toBe('見る（みる）')
    expect(itemName({ itemId: 'kanji:日', headword: '日' })).toBe('日')
    expect(itemName({ itemId: 'kanji:日' })).toBe('日')
  })

  test('a filter matches the headword or reading, whatever the width or case', () => {
    const word = { headword: 'Ｔシャツ', reading: 'てぃーしゃつ' }
    expect(matchesTyped(word, 't')).toBe(true)
    expect(matchesTyped(word, 'しゃつ')).toBe(true)
    expect(matchesTyped(word, '  ')).toBe(true)
    expect(matchesTyped(word, 'ズボン')).toBe(false)
  })

  test("a video's place reads as the app's clock does", () => {
    expect(shownDuration(75)).toBe('1:15')
    expect(shownDuration(3725)).toBe('1:02:05')
    expect(shownDuration(-3)).toBe('0:00')
  })

  test('a setting by its name in the app, its value in words, and a pack this site doesn’t know by its ID', () => {
    const settings = words.settings
    expect(settingName('readingAids.furiganaHiddenOnKnownWords', settings)).toBe(
      'Hide Furigana on Known Words'
    )
    expect(settingName('someday.newSetting', settings)).toBe('someday.newSetting')
    expect(settingValue('readingAids.romaji', false, 'en', settings)).toBe('Off')
    expect(settingValue('translate.speechSpeed', 1.5, 'en', settings)).toBe('1.5×')
    expect(settingValue('search.filter', 'unknown', 'en', settings)).toBe('Unknown words')
    expect(settingValue('search.sort', 'frequency|zenbu.jiten.anime', 'en', settings)).toBe(
      'Frequency: Anime'
    )
    expect(settingValue('readingAids.translationLanguage', 'en', 'en', settings)).toBe('English')
    expect(packName('zenbu.jlpt.waller.levels', 'en', words)).toBe('JLPT Levels')
    expect(packName('zenbu.someday', 'en', words)).toBe(
      'A dictionary this site doesn’t know (zenbu.someday)'
    )
  })
})

describe('the photos a page downloads', () => {
  test('wait as long as the account says when it has had too many, then ask once more', async () => {
    vi.useFakeTimers()
    const tooMany = refusedResult(429, 'too_many_requests')
    if (!tooMany.ok && tooMany.failure.kind === 'refused') tooMany.failure.retryAfter = 2
    const answers: Result<Blob>[] = [tooMany, { ok: true, value: new Blob(['jpeg']) }, tooMany]
    const download = vi.fn(async () => answers.shift() ?? tooMany)
    const loading = photoQueue(download)('p1')
    await vi.advanceTimersByTimeAsync(1999)
    expect(download).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await loading).ok).toBe(true)
    const again = photoQueue(download)('p2')
    await vi.advanceTimersByTimeAsync(2000)
    expect((await again).ok).toBe(false)
    expect(download).toHaveBeenCalledTimes(4)
    vi.useRealTimers()
  })

  test('go a few at a time, and each waiting one starts as one ends', async () => {
    let running = 0
    let most = 0
    const finish: (() => void)[] = []
    const download = () =>
      new Promise<Result<Blob>>(resolve => {
        running += 1
        most = Math.max(most, running)
        finish.push(() => {
          running -= 1
          resolve({ ok: true, value: new Blob() })
        })
      })
    const load = photoQueue(download, 2)
    const loads = Array.from({ length: 5 }, (_, n) => load(`p${n}`))
    await Promise.resolve()
    expect(running).toBe(2)
    while (finish.length > 0) {
      finish.shift()?.()
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    await Promise.all(loads)
    expect(most).toBe(2)
  })
})
