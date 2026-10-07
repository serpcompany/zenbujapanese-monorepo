import { readFileSync } from 'node:fs'
import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import type { KanjiData } from '@zenbu/dictionary-core/artifact/kanji-data'
import {
  exportWordCards,
  readWordCards,
  resolveWords
} from '@zenbu/dictionary-core/artifact/word-cards'
import { rankedLists } from '@zenbu/dictionary-core/browse/lists'
import { cardFields, type RecordedWord, recordedFields } from '@zenbu/dictionary-core/cards/suite'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  artifactAvailable,
  artifactDatabase,
  artifactKanji,
  readSuite,
  requirePinnedArtifacts
} from './support'

const wordSuite = readSuite<{
  artifacts: { name: string; sha256: string }[]
  cases: (RecordedWord & { covers: string })[]
}>('word-detail')

const miru = '7f490a9c9c0da94f4e9474f4efe74be1'

describe.runIf(artifactAvailable)('word cards on the app’s data', () => {
  let db: ArtifactDatabase
  let kanji: KanjiData

  beforeAll(async () => {
    requirePinnedArtifacts(wordSuite.artifacts)
    db = await artifactDatabase()
    kanji = await artifactKanji()
  })

  test('a card for each word the word-detail suite records holds what it records', () => {
    const cards = readWordCards(
      db,
      kanji,
      wordSuite.cases.map(word => word.languageReferenceID)
    )
    const byId = new Map(cards.map(card => [card.languageReferenceID, card]))
    for (const recorded of wordSuite.cases) {
      const card = byId.get(recorded.languageReferenceID)
      expect(card && cardFields(card), recorded.covers).toEqual(recordedFields(recorded))
    }
  })

  test('each ranked list’s chip is the word’s rank in that list', () => {
    const [card] = readWordCards(db, kanji, [miru])
    for (const list of rankedLists) {
      if (list.source.kind !== 'pack') continue
      const [row] = db.all<{ rank: number }>(
        `SELECT r.rank FROM ranked.ranked_evidence r
         JOIN ranked.ranked_lists l ON l.list_id = r.list_id AND l.pack_id = ?
         WHERE r.language_reference_id = unhex(?)`,
        [list.source.packId, miru]
      )
      expect(card.frequency.find(chip => chip.list === list.slug)?.rank, list.slug).toBe(
        row?.rank ?? null
      )
    }
  })

  test('a headword and reading resolve to one entry, or are reported ambiguous or unresolved', () => {
    const resolved = resolveWords(db, [
      { headword: '見る', reading: 'みる' },
      { languageReferenceID: miru.toUpperCase() },
      { headword: 'それ', reading: 'それ' },
      { headword: 'ありえない語', reading: 'ありえないご' },
      { languageReferenceID: '0'.repeat(32) }
    ])
    expect(resolved.languageReferenceIDs).toEqual([miru])
    expect(resolved.ambiguous.map(({ candidates }) => candidates.map(c => c.entSeq))).toEqual([
      [1006970, 2216210]
    ])
    expect(resolved.unresolved).toEqual([
      { headword: 'ありえない語', reading: 'ありえないご' },
      { languageReferenceID: '0'.repeat(32) }
    ])
  })

  test('an export names its language data and the notice every source needs', () => {
    const languageData = { release: 'test', file: 'LanguageReferenceData.sqlite3', sha256: 'abc' }
    const exported = exportWordCards(db, kanji, languageData, [
      { headword: '見る', reading: 'みる' }
    ])
    expect(exported).toMatchObject({ format: 'zenbu.word-cards.v1', languageData })
    expect(exported.cards.map(card => card.languageReferenceID)).toEqual([miru])
    const inputs = JSON.parse(
      readFileSync(
        new URL('../../../../language-data/release-inputs.json', import.meta.url),
        'utf8'
      )
    ) as { files: { name: string }[] }
    const released = new Set(inputs.files.map(file => file.name))
    expect(
      exported.sources.map(source => source.notice).filter(name => !released.has(name))
    ).toEqual([])
  })
})
