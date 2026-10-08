import { type FrequencyResult, tierLabels } from '../detail/frequency'
import type { WordCard, WordCardFurigana, WordCardMeaning } from './card'

interface RecordedChip {
  name: string
  text: string
  tier?: string
}

interface RecordedPitch {
  downstep: number
  levels: string
  moraCount: number
  particle: string
  source: string
}

export interface RecordedWord {
  languageReferenceID: string
  headword: string
  reading: string
  furigana: WordCardFurigana[]
  partOfSpeech: string
  senses: WordCardMeaning[]
  pitch?: RecordedPitch & { graph: { morae: string[] } }
  frequency: RecordedChip[]
}

export interface CardFields {
  languageReferenceID: string
  headword: string
  reading: string
  furigana: WordCardFurigana[]
  partOfSpeech: string
  senses: WordCardMeaning[]
  pitch: (RecordedPitch & { morae: string[] }) | null
  jlpt: RecordedChip | null
  youtube: RecordedChip | null
}

const chip = ({ source, value, tier }: FrequencyResult): RecordedChip => ({
  name: source,
  text: value,
  ...(tier === null ? {} : { tier: tierLabels[tier] })
})

export function cardFields(card: WordCard): CardFields {
  const youtube = card.frequency.find(rank => rank.list === 'youtube')
  const { estimated: _, ...pitch } = card.pitch ?? { estimated: false }
  return {
    languageReferenceID: card.languageReferenceID,
    headword: card.headword,
    reading: card.reading,
    furigana: card.furigana,
    partOfSpeech: card.partOfSpeech,
    senses: card.meanings,
    pitch: card.pitch && (pitch as RecordedPitch & { morae: string[] }),
    jlpt: card.jlpt && chip(card.jlpt),
    youtube: youtube ? chip(youtube) : null
  }
}

const recordedChip = ({ name, text, tier }: RecordedChip): RecordedChip => ({
  name,
  text,
  ...(tier === undefined ? {} : { tier })
})

export function recordedFields(recorded: RecordedWord): CardFields {
  const [jlpt, youtube] = recorded.frequency
  const { graph, ...pitch } = recorded.pitch ?? { graph: { morae: [] } }
  return {
    languageReferenceID: recorded.languageReferenceID,
    headword: recorded.headword,
    reading: recorded.reading,
    furigana: recorded.furigana,
    partOfSpeech: recorded.partOfSpeech,
    senses: recorded.senses,
    pitch: recorded.pitch ? { ...(pitch as RecordedPitch), morae: graph.morae } : null,
    jlpt: jlpt.tier ? recordedChip(jlpt) : null,
    youtube: recordedChip(youtube)
  }
}
