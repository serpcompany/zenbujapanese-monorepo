import { rankedLists } from '../browse/lists'
import { type FrequencyResult, levelResult, rankResult } from '../detail/frequency'
import type { WordRows } from '../detail/rows'
import { type FuriganaSegment, furiganaSegments } from '../detail/ruby'
import { wordDetail } from '../detail/word'

export const wordCardFormat = 'zenbu.word-cards.v1'

export type WordCardFurigana = FuriganaSegment

interface WordCardPitch {
  downstep: number
  moraCount: number
  morae: string[]
  levels: string
  particle: 'H' | 'L'
  estimated: boolean
  source: string
}

export interface WordCardMeaning {
  meaning: string
  notes: string[]
  partsOfSpeech: string[]
}

interface WordCardLevel extends FrequencyResult {
  level: number
}

interface WordCardRank extends FrequencyResult {
  list: string
  rank: number | null
}

export interface WordCard {
  languageReferenceID: string
  entSeq: number
  headword: string
  reading: string
  furigana: WordCardFurigana[]
  pitch: WordCardPitch | null
  partOfSpeech: string
  meanings: WordCardMeaning[]
  jlpt: WordCardLevel | null
  frequency: WordCardRank[]
}

export type ListRanks = ReadonlyMap<string, number>

export type CardRows = Pick<WordRows, 'entry' | 'frequency' | 'kanji'>

export function wordCard(rows: CardRows, ranks: ListRanks): WordCard {
  const { entry } = rows
  const detail = wordDetail({ ...rows, examples: [], exampleCount: null })
  const pitchRow = entry.pitch ?? entry.compoundPitch
  const jlpt = rows.frequency.find(row => row.pack === 'jlpt')
  const youtube = rows.frequency.find(row => row.pack === 'tubelex')
  return {
    languageReferenceID: entry.id,
    entSeq: entry.entSeq,
    headword: entry.headword,
    reading: entry.reading,
    furigana: furiganaSegments(detail.ruby),
    pitch:
      detail.pitch && pitchRow
        ? {
            downstep: detail.pitch.downstep,
            moraCount: pitchRow.moraCount,
            morae: detail.pitch.morae.map(({ mora }) => mora),
            levels: detail.pitch.morae.map(({ high }) => (high ? 'H' : 'L')).join(''),
            particle: detail.pitch.particleHigh ? 'H' : 'L',
            estimated: entry.pitch === null,
            source: pitchRow.sourceIdentity
          }
        : null,
    partOfSpeech: detail.partOfSpeech,
    meanings: entry.senses.map(({ meaning, notes, partsOfSpeech }) => ({
      meaning,
      notes,
      partsOfSpeech
    })),
    jlpt: jlpt?.pack === 'jlpt' ? { ...levelResult('JLPT', jlpt.level), level: jlpt.level } : null,
    frequency: rankedLists.map(list => {
      const rank =
        list.source.kind === 'tubelex'
          ? youtube?.pack === 'tubelex'
            ? youtube.rank
            : undefined
          : ranks.get(list.source.packId)
      return rank === undefined
        ? {
            list: list.slug,
            rank: null,
            source: list.chip,
            value: 'No rank',
            tier: null,
            spokenTier: null
          }
        : { list: list.slug, rank, ...rankResult(list.chip, rank) }
    })
  }
}
