import { rankedLists } from '../browse/lists'
import { type FrequencyResult, levelResult, rankResult } from '../detail/frequency'
import { shownPitch } from '../detail/pitch'
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

export interface WordCardLevel extends FrequencyResult {
  level: number
}

export interface WordCardRank extends FrequencyResult {
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

export type WordCardBody = Omit<WordCard, 'jlpt' | 'frequency'>

export function wordCardBody({ entry, kanji }: Omit<CardRows, 'frequency'>): WordCardBody {
  const detail = wordDetail({
    entry,
    kanji,
    frequency: [],
    examples: [],
    exampleCount: null,
    senseExamples: []
  })
  const pitchRow = shownPitch(entry)
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
    }))
  }
}

export const jlptChip = (level: number): WordCardLevel => ({
  ...levelResult('JLPT', level),
  level
})

export const rankChip = (list: string, source: string, rank: number | null): WordCardRank =>
  rank === null
    ? { list, rank: null, source, value: 'No rank', tier: null, spokenTier: null }
    : { list, rank, ...rankResult(source, rank) }

export function wordCard(rows: CardRows, ranks: ListRanks): WordCard {
  const jlpt = rows.frequency.find(row => row.pack === 'jlpt')
  const youtube = rows.frequency.find(row => row.pack === 'tubelex')
  return {
    ...wordCardBody(rows),
    jlpt: jlpt?.pack === 'jlpt' ? jlptChip(jlpt.level) : null,
    frequency: rankedLists.map(list =>
      rankChip(
        list.slug,
        list.chip,
        (list.source.kind === 'tubelex'
          ? youtube?.pack === 'tubelex'
            ? youtube.rank
            : undefined
          : ranks.get(list.source.packId)) ?? null
      )
    )
  }
}
