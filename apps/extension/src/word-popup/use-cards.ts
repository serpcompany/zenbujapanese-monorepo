import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import { useEffect, useState } from 'react'
import type { Lookup, PopupAnswer } from '../shared/dictionary'

export type WordLookUp = (languageReferenceID: string) => Lookup<PopupAnswer>

export type Looked =
  | { type: 'card'; card: WordCard; romaji: string | null }
  | { type: 'not-found' }
  | { type: 'failed' }

const failed: Looked = { type: 'failed' }

function looked(answer: Awaited<ReturnType<WordLookUp>>): Looked {
  if (answer.type !== 'popup') return failed
  return answer.card
    ? { type: 'card', card: answer.card.card, romaji: answer.card.romaji }
    : { type: 'not-found' }
}

export function useCards(ids: readonly string[], lookUp: WordLookUp): Record<string, Looked> {
  const [cards, setCards] = useState<Record<string, Looked>>({})
  useEffect(() => {
    let live = true
    for (const id of ids) {
      lookUp(id)
        .then(looked, () => failed)
        .then(result => {
          if (live) setCards(known => ({ ...known, [id]: result }))
        })
    }
    return () => {
      live = false
    }
  }, [ids, lookUp])
  return cards
}
