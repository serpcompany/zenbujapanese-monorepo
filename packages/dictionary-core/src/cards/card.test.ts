import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { rankedLists } from '../browse/lists'
import { fixtureWordRows } from '../fixtures'
import { wordCard } from './card'
import { cardFields, type RecordedWord, recordedFields } from './suite'

const suite = JSON.parse(
  readFileSync(
    new URL('../../../../apps/ios/LanguageData/Conformance/word-detail.json', import.meta.url),
    'utf8'
  )
) as { cases: (RecordedWord & { entSeq: string[] })[] }

const fixtureWords = fixtureWordRows.flatMap(rows => {
  const recorded = suite.cases.find(word => Number(word.entSeq[0]) === rows.entry.entSeq)
  return recorded ? [{ rows, recorded }] : []
})

describe('a word card', () => {
  test('is made for the fixture words the word-detail suite records', () => {
    expect(fixtureWords.map(({ rows }) => rows.entry.headword)).toEqual(['要る', 'いる'])
  })

  test.each(fixtureWords)('holds what the word-detail suite records for $recorded.headword', ({
    rows,
    recorded
  }) => {
    expect(cardFields(wordCard(rows, new Map()))).toEqual(recordedFields(recorded))
  })

  test('has a chip for each of the eight ranked lists, in their order, ranked or not', () => {
    const [{ rows }] = fixtureWords
    const anime = rankedLists.find(list => list.slug === 'anime')?.source
    const ranks = new Map(anime?.kind === 'pack' ? [[anime.packId, 2_345]] : [])
    const card = wordCard(rows, ranks)
    expect(card.frequency.map(({ list, source }) => [list, source])).toEqual(
      rankedLists.map(list => [list.slug, list.chip])
    )
    expect(card.frequency.find(chip => chip.list === 'anime')).toMatchObject({
      rank: 2_345,
      value: '2,345',
      tier: 'common'
    })
    expect(card.frequency.find(chip => chip.list === 'manga')).toMatchObject({
      rank: null,
      value: 'No rank',
      tier: null
    })
  })

  test('says whether its pitch is UniDic’s own or estimated for a compound', () => {
    const [{ rows }] = fixtureWords
    const pitch = { downstep: 0, moraCount: 2, sourceIdentity: 'compound' }
    const entry = { ...rows.entry, pitch: null, compoundPitch: pitch }
    expect(wordCard({ ...rows, entry }, new Map()).pitch).toMatchObject({
      estimated: true,
      source: 'compound',
      downstep: 0
    })
    expect(wordCard(rows, new Map()).pitch?.estimated).toBe(false)
  })
})
