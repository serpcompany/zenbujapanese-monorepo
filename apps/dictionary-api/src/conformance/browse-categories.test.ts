import type { BrowseWord, DictionaryBrowse } from '@zenbu/dictionary-core/artifact/browse'
import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import {
  type BrowseCategory,
  browseCategories,
  browseCategory,
  senseLabelKeys
} from '@zenbu/dictionary-core/browse/categories'
import { isContentWord } from '@zenbu/dictionary-core/browse/content-words'
import { browsePageSize, minimumIndexedWords } from '@zenbu/dictionary-core/browse/lists'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase, browse } from './support'

interface Sense {
  meaning: string
  partsOfSpeech: string[]
  [key: string]: unknown
}

function sensesOf(db: ArtifactDatabase, words: readonly BrowseWord[]): Map<number, Sense[]> {
  const rows = db.all<{ ent_seq: number; senses: string }>(
    `SELECT source_record_id AS ent_seq, senses_json AS senses FROM entries
     WHERE source_record_id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(words.map(word => word.entSeq))]
  )
  return new Map(rows.map(row => [row.ent_seq, JSON.parse(row.senses) as Sense[]]))
}

const labelKey = (category: BrowseCategory) =>
  category.kind === 'partOfSpeech'
    ? 'partsOfSpeech'
    : category.kind === 'common'
      ? null
      : senseLabelKeys[category.kind]

function labelledSenses(category: BrowseCategory, senses: readonly Sense[]): number[] {
  const key = labelKey(category)
  if (key === null) return [0]
  return senses.flatMap((sense, index) => {
    const labels = (sense[key] as string[] | undefined) ?? []
    return labels.some(label => category.labels.includes(label)) ? [index] : []
  })
}

const youtubeRank = (word: BrowseWord) => {
  const chip = word.chips.find(each => each.source === 'YouTube' && each.value !== '—')
  return chip ? Number(chip.value.replaceAll(',', '')) : null
}

function findWord(
  service: DictionaryBrowse,
  slug: string,
  entSeq: number
): { word: BrowseWord; page: number; position: number } | null {
  for (let page = 1; ; page += 1) {
    const listed = service.categoryWords(slug, 'used', page)
    if (!listed) return null
    const position = listed.words.findIndex(word => word.entSeq === entSeq)
    if (position >= 0) return { word: listed.words[position], page, position }
  }
}

const and = 1008490
const iku = 1578850
const na = 2029110

describe.runIf(artifactAvailable)('browsing a category on the app’s data', () => {
  let service: DictionaryBrowse
  let db: ArtifactDatabase

  beforeAll(async () => {
    service = await browse()
    db = await artifactDatabase()
  })

  test('each row shows the first meaning that carries the category’s label', () => {
    for (const category of browseCategories) {
      const words = service.categoryWords(category.slug, 'kana', 1)?.words ?? []
      const senses = sensesOf(db, words)
      for (const word of words) {
        const [first] = labelledSenses(category, senses.get(word.entSeq) ?? [])
        expect(first, `${category.slug} ${word.headword}`).toBeDefined()
        expect(word.summary, `${category.slug} ${word.headword}`).toBe(
          senses.get(word.entSeq)?.[first]?.meaning
        )
      }
    }
  })

  test('a category leads with the words it labels in their first meaning, each part most used first', () => {
    for (const category of browseCategories) {
      const words = service.categoryWords(category.slug, 'used', 1)?.words ?? []
      const senses = sensesOf(db, words)
      const ranked = words.filter(word => youtubeRank(word) !== null)
      const tiers = ranked.map(word =>
        labelledSenses(category, senses.get(word.entSeq) ?? [])[0] === 0 ? 0 : 1
      )
      expect(tiers, category.slug).toEqual([...tiers].sort())
      const ranks = ranked.map((word, index) => [tiers[index], youtubeRank(word) ?? 0] as const)
      expect(ranks, category.slug).toEqual(
        [...ranks].sort(
          ([leftTier, left], [rightTier, right]) => leftTier - rightTier || left - right
        )
      )
      expect(words.slice(ranked.length).every(word => youtubeRank(word) === null)).toBe(true)
    }
  })

  test('a word labelled only in a later meaning follows, showing that meaning', () => {
    const [noun] = service.categoryWords('nouns', 'used', 1)?.words ?? []
    expect(noun.headword).toBe('事')
    const promotedPawn = findWord(service, 'nouns', and)
    expect(promotedPawn?.word.summary).toBe('promoted pawn')
    expect(promotedPawn?.page).toBeGreaterThan(1)
    const slang = findWord(service, 'slang', iku)
    expect(slang?.word.summary).toMatch(/^to trip, to get high/)
    expect(slang?.page === 1 && slang.position === 0).toBe(false)
    const kansai = service.categoryWords('kansai-dialect', 'used', 1)?.words ?? []
    expect(kansai[0].entSeq).not.toBe(na)
    expect(kansai.find(word => word.entSeq === na)?.summary).toMatch(/^right\?/)
  })

  test('kana order lists the same words by reading', () => {
    const slug = 'onomatopoeia'
    const used = service.categoryWords(slug, 'used', 1)
    const kana = service.categoryWords(slug, 'kana', 1)
    expect(kana?.total).toBe(used?.total)
    const readings = (kana?.words ?? []).map(word => word.reading)
    expect(readings).toEqual([...readings].sort())
    expect(kana?.words).toHaveLength(browsePageSize)
  })

  test('the index lists a category as its own query would', () => {
    const entSeqs = (sql: string, params: string[]) =>
      db.all<{ ent_seq: number }>(sql, params).map(row => row.ent_seq)
    const labelled = (path: string) =>
      `EXISTS (SELECT 1 FROM json_each(e.senses_json, '${path}') l WHERE l.value = ?)`
    const onomatopoeia = entSeqs(
      `SELECT e.source_record_id AS ent_seq FROM entries e
       LEFT JOIN tubelex.frequency_evidence t ON t.language_reference_id = e.id
       WHERE EXISTS (SELECT 1 FROM json_each(e.senses_json) s, json_each(s.value, '$.usage') l
         WHERE l.value = ?)
       ORDER BY t.rank IS NULL, t.rank IS NOT NULL AND NOT ${labelled('$[0].usage')}, t.rank,
         e.reading, e.source_record_id`,
      ['onomatopoeic', 'onomatopoeic']
    )
    const listed = (page: number) =>
      (service.categoryWords('onomatopoeia', 'used', page)?.words ?? []).map(word => word.entSeq)
    expect([...listed(1), ...listed(2)]).toEqual(onomatopoeia.slice(0, 2 * browsePageSize))
    expect(service.categoryWords('onomatopoeia', 'used', 1)?.total).toBe(onomatopoeia.length)
  })

  test('the categories under 10 words are the thin ones the sitemap leaves out', () => {
    const thin = service
      .sitemap()
      .categories.filter(({ count }) => count < minimumIndexedWords)
      .map(({ slug }) => slug)
    expect(thin).toEqual(
      expect.arrayContaining(['audiovisual', 'paleontology', 'manga', 'nagano-dialect'])
    )
    expect(thin).toHaveLength(11)
    expect(thin.every(slug => browseCategory(slug))).toBe(true)
  })

  test('the home’s common words are content words, most used first', () => {
    const { commonWords } = service.summary()
    expect(commonWords).toHaveLength(24)
    const rows = db.all<{ ent_seq: number; first: string; parts: string }>(
      `SELECT source_record_id AS ent_seq, json_extract(senses_json, '$[0].partsOfSpeech') AS first,
         parts_of_speech_json AS parts FROM entries
       WHERE source_record_id IN (SELECT value FROM json_each(?))`,
      [JSON.stringify(commonWords.map(word => word.entSeq))]
    )
    expect(rows).toHaveLength(24)
    for (const row of rows) {
      expect(isContentWord(JSON.parse(row.first), JSON.parse(row.parts)), String(row.ent_seq)).toBe(
        true
      )
    }
    expect(commonWords.map(word => word.headword)).not.toContain('の')
  })
})
