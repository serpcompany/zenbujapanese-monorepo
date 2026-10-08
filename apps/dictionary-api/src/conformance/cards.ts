import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import { cardFields, type RecordedWord, recordedFields } from '@zenbu/dictionary-core/cards/suite'
import { expect } from 'vitest'

export function expectCardsAsRecorded(
  cards: readonly WordCard[],
  recorded: readonly (RecordedWord & { covers: string })[]
) {
  const byId = new Map(cards.map(card => [card.languageReferenceID, card]))
  for (const word of recorded) {
    const card = byId.get(word.languageReferenceID)
    expect(card && cardFields(card), word.covers).toEqual(recordedFields(word))
  }
}
