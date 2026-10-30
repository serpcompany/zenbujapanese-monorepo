import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import {
  defaultFrequencyPacks,
  type FrequencyResult
} from '@zenbu/dictionary-core/detail/frequency'
import { pitchAccent } from '@zenbu/dictionary-core/detail/pitch'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { fill } from '@zenbu/dictionary-core/detail/template'
import type { ShownFrequency } from '@zenbu/ui/dictionary/frequency'
import { wordDetailLabels } from '../word-detail/labels'

export const cardRuby = (card: WordCard): RubySegment[] =>
  card.furigana.map(({ base, reading }) => (reading ? { text: base, reading } : { text: base }))

export const cardPitch = (card: WordCard) =>
  card.pitch
    ? pitchAccent(card.reading, {
        downstep: card.pitch.downstep,
        moraCount: card.pitch.moraCount,
        sourceIdentity: card.pitch.source
      })
    : null

const badge = (result: FrequencyResult): ShownFrequency => ({
  ...result,
  shownSource: result.source,
  spokenTier: result.spokenTier
    ? fill(wordDetailLabels.frequency.spokenTier, { tier: result.spokenTier })
    : null
})

export function cardBadges(card: WordCard, chosen: readonly string[]): ShownFrequency[] {
  const ranks = [...card.frequency]
  return chosen.flatMap(id => {
    const pack = defaultFrequencyPacks.find(known => known.id === id)
    if (!pack) return []
    const shown = pack.kind === 'level' ? card.jlpt : ranks.shift()
    return shown ? [badge(shown)] : []
  })
}

export function shareText(card: WordCard): string {
  const heading =
    card.reading === card.headword ? card.headword : `${card.headword}【${card.reading}】`
  return [heading, ...card.meanings.map((sense, index) => `${index + 1}. ${sense.meaning}`)].join(
    '\n'
  )
}
