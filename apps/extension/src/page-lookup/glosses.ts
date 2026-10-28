import { shortGloss } from '@zenbu/dictionary-core/detail/text'
import type { Lookup, PopupAnswer } from '../shared/dictionary'

export type GlossLookUp = (languageReferenceID: string) => Lookup<PopupAnswer>

export type GlossCache = {
  known: ReadonlyMap<string, string | null>
  fetch(ids: readonly string[]): Promise<void>
}

export function glossCache(lookUp: GlossLookUp, running = 4): GlossCache {
  const known = new Map<string, string | null>()
  const asked = new Map<string, Promise<void>>()
  const waiting: (() => void)[] = []
  let busy = 0

  const slot = () => {
    if (busy < running) {
      busy += 1
      return Promise.resolve()
    }
    return new Promise<void>(go => waiting.push(go))
  }
  const release = () => {
    const next = waiting.shift()
    if (next) next()
    else busy -= 1
  }

  const ask = (id: string) => {
    const asking =
      asked.get(id) ??
      slot()
        .then(() => lookUp(id))
        .then(
          answer => {
            if (answer.type !== 'popup') return void asked.delete(id)
            const first = answer.card?.card.meanings[0]
            known.set(id, first ? shortGloss(first.meaning) : null)
          },
          () => void asked.delete(id)
        )
        .finally(release)
    asked.set(id, asking)
    return asking
  }

  return {
    known,
    fetch: ids => Promise.all(ids.filter(id => !known.has(id)).map(ask)).then(() => undefined)
  }
}
