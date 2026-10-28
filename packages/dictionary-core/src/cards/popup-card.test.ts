import { describe, expect, test } from 'vitest'
import {
  defaultFrequencyPacks,
  type FrequencyDictionary,
  type FrequencyLookup
} from '../detail/frequency'
import { fixtureWordRows } from '../fixtures'
import { wordCard } from './card'
import { popupCard } from './popup-card'

const [jlpt, youtube] = defaultFrequencyPacks
const [rows] = fixtureWordRows

const wikipedia: FrequencyDictionary = {
  ...youtube,
  id: 'zenbu.wikipedia.written.ja.unidic-3.1',
  name: 'Wikipedia'
}

const { jlpt: _jlpt, frequency: _frequency, ...body } = wordCard(rows, new Map())

describe('a word popup card', () => {
  test('holds the word card’s headword, reading, furigana, pitch and meanings', () => {
    const { card } = popupCard(rows, [])
    expect(card).toMatchObject(body)
    expect(card.jlpt).toBeNull()
    expect(card.frequency).toEqual([])
  })

  test('says the reading in romaji', () => {
    expect(popupCard(rows, []).romaji).toBe('iru')
  })

  test('shows the JLPT level and the ranks of the learner’s dictionaries, ranks in their order', () => {
    const lookups: FrequencyLookup[] = [
      { dictionary: wikipedia, value: 4_321 },
      { dictionary: jlpt, value: 4 },
      { dictionary: youtube, value: 120 }
    ]
    const { card } = popupCard(rows, lookups)
    expect(card.jlpt).toMatchObject({ level: 4, source: 'JLPT', value: 'N4' })
    expect(
      card.frequency.map(({ list, source, rank, value }) => [list, source, rank, value])
    ).toEqual([
      ['wikipedia', 'Wikipedia', 4_321, '4,321'],
      ['youtube', 'YouTube', 120, '120']
    ])
  })

  test('shows no chips for dictionaries the learner turned off', () => {
    const { card } = popupCard(rows, [{ dictionary: youtube, value: 120 }])
    expect(card.jlpt).toBeNull()
    expect(card.frequency.map(({ list }) => list)).toEqual(['youtube'])
  })

  test('says a word a dictionary does not rank has no rank', () => {
    const { card } = popupCard(rows, [
      { dictionary: jlpt, value: null },
      { dictionary: youtube, value: null }
    ])
    expect(card.jlpt).toBeNull()
    expect(card.frequency).toEqual([
      {
        list: 'youtube',
        source: 'YouTube',
        rank: null,
        value: 'No rank',
        tier: null,
        spokenTier: null
      }
    ])
  })

  test('says a dictionary it cannot read is unavailable, rather than that the word has no rank', () => {
    const { card } = popupCard(rows, [
      { dictionary: youtube, unavailable: 'Frequency data unavailable' }
    ])
    expect(card.frequency).toEqual([
      {
        list: 'youtube',
        source: 'YouTube',
        rank: null,
        value: 'Unavailable',
        tier: null,
        spokenTier: null
      }
    ])
  })
})
