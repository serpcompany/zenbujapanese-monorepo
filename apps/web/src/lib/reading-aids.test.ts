import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vitest'
import {
  attributeValue,
  type ReadingAid,
  readingAidStorageKey,
  readingAids,
  readingAidsScript,
  shownFromStored
} from './reading-aids'

const appSource = (file: string) =>
  readFileSync(
    fileURLToPath(
      new URL(`../../../ios/Modules/Sources/SearchExperience/${file}`, import.meta.url)
    ),
    'utf8'
  )

const appField: Record<ReadingAid, string> = {
  furigana: 'showsFurigana',
  romaji: 'showsRomaji',
  wordMeanings: 'showsWordMeanings',
  translations: 'showsTranslations'
}

describe('the reading aids follow the app', () => {
  test('each one is on or off by default as ReadingAidPreferences.swift sets it', () => {
    const preferences = appSource('ReadingAidPreferences.swift')
    for (const aid of readingAids) {
      const declared = preferences.match(new RegExp(`var ${appField[aid.id]} = (true|false)`))
      expect(declared?.[1], aid.id).toBe(String(aid.shownByDefault))
    }
    expect(readingAids.map(aid => [aid.id, aid.shownByDefault])).toEqual([
      ['furigana', true],
      ['romaji', false],
      ['wordMeanings', false],
      ['translations', true]
    ])
  })

  test('each one is kept under the id the app syncs it by', () => {
    const synced = appSource('SyncedSettings.swift')
    for (const aid of readingAids) {
      expect(synced).toContain(`"${readingAidStorageKey(aid.id)}", field: "${appField[aid.id]}"`)
    }
  })
})

describe('a kept setting', () => {
  test.each(readingAids)('$id reads true and false, and anything else as its default', aid => {
    expect(shownFromStored(aid.id, 'true')).toBe(true)
    expect(shownFromStored(aid.id, 'false')).toBe(false)
    for (const other of [null, '', 'yes', 'on', '1']) {
      expect(shownFromStored(aid.id, other)).toBe(aid.shownByDefault)
    }
  })
})

type Kept = Partial<Record<ReadingAid, string>>

function runTheScript(kept: Kept | 'unreadable') {
  const attributes: Record<string, string> = {}
  const storageListeners: ((event: { key: string; newValue: string | null }) => void)[] = []
  const localStorage = {
    getItem(key: string) {
      if (kept === 'unreadable') throw new Error('The storage is blocked')
      const aid = readingAids.find(candidate => readingAidStorageKey(candidate.id) === key)
      return aid ? (kept[aid.id] ?? null) : null
    }
  }
  const documentElement = {
    setAttribute(name: string, value: string) {
      attributes[name] = value
    }
  }
  runInNewContext(readingAidsScript, {
    localStorage,
    document: { documentElement },
    addEventListener(type: string, listener: (typeof storageListeners)[number]) {
      if (type === 'storage') storageListeners.push(listener)
    }
  })
  const storageChanged = (key: string, newValue: string | null) => {
    for (const listener of storageListeners) listener({ key, newValue })
  }
  return { attributes, storageChanged }
}

describe('the script in the head', () => {
  const cases: (Kept | 'unreadable')[] = [
    {},
    'unreadable',
    { furigana: 'false', romaji: 'true', wordMeanings: 'true', translations: 'false' },
    { furigana: 'true', romaji: 'false', wordMeanings: 'false', translations: 'true' },
    { romaji: 'yes', translations: 'false' }
  ]

  test.each(cases)('sets every aid’s attribute as the store reads %j', kept => {
    expect(runTheScript(kept).attributes).toEqual(
      Object.fromEntries(
        readingAids.map(aid => [
          aid.attribute,
          attributeValue(
            shownFromStored(aid.id, kept === 'unreadable' ? null : (kept[aid.id] ?? null))
          )
        ])
      )
    )
  })

  test('follows a kept setting another tab changes, and nothing else', () => {
    const { attributes, storageChanged } = runTheScript({})
    storageChanged(readingAidStorageKey('romaji'), 'true')
    storageChanged(readingAidStorageKey('furigana'), 'false')
    storageChanged('theme', 'dark')
    expect(attributes).toEqual({
      'data-furigana': 'off',
      'data-romaji': 'on',
      'data-word-meanings': 'off',
      'data-translations': 'on'
    })
    storageChanged(readingAidStorageKey('romaji'), null)
    expect(attributes['data-romaji']).toBe('off')
  })
})
