import { isContentWord } from '@zenbu/dictionary-core/browse/content-words'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { type GlossCache, glossCache } from '../page-lookup/glosses'
import { type Found, wordIds } from '../page-lookup/rendering'
import { knownAtOnce } from '../shared/account-copy'
import type { TranslateServices } from '../translate/services'

export type CaptionGlosses = GlossCache & { functionWords: ReadonlySet<string> }

export function captionGlosses(services: Pick<TranslateServices, 'popupCard'>): CaptionGlosses {
  const functionWords = new Set<string>()
  const cache = glossCache(id =>
    services.popupCard(id, []).then(answer => {
      if (answer.type !== 'popup' || !answer.card) return answer
      const { meanings } = answer.card.card
      const parts = meanings.flatMap(meaning => meaning.partsOfSpeech)
      if (isContentWord(meanings[0]?.partsOfSpeech ?? [], parts)) return answer
      functionWords.add(id)
      return { ...answer, card: null }
    })
  )
  return { ...cache, functionWords }
}

export type KnownSource = {
  knownWords(items: string[]): Promise<Record<string, boolean>>
  watchKnown(heard: (known: Record<string, boolean> | null) => void): () => void
}

export type KnownWords = {
  has(id: string): boolean
  unanswered(id: string): boolean
  fetch(ids: readonly string[]): Promise<string[]>
  version(): number
  subscribe(listener: () => void): () => void
  stop(): void
}

export function knownWords({ knownWords: ask, watchKnown }: KnownSource): KnownWords {
  const known = new Map<string, boolean>()
  const missed = new Set<string>()
  const unanswered = new Set<string>()
  const listeners = new Set<() => void>()
  let pending: string[] = []
  let answered: Promise<unknown> = Promise.resolve()
  let version = 0

  const tell = () => {
    version += 1
    for (const listener of [...listeners]) listener()
  }

  const heard = (answer: Record<string, boolean>, settled = false) => {
    const changed = Object.entries(answer).filter(
      ([id, now]) => known.has(id) && known.get(id) !== now
    )
    for (const [id, now] of changed) known.set(id, now)
    if (changed.length > 0 || settled) tell()
  }

  const settle = (ids: readonly string[]) => ids.filter(id => unanswered.delete(id)).length > 0

  const flush = () => {
    const asked = pending
    pending = []
    const asking: Promise<void>[] = []
    for (let at = 0; at < asked.length; at += knownAtOnce) {
      const some = asked.slice(at, at + knownAtOnce)
      asking.push(
        ask(some).then(
          answer => heard(answer, settle(some)),
          () => {
            const settled = some.filter(id => {
              if (known.get(id) !== false) return true
              known.delete(id)
              missed.add(id)
              return false
            })
            if (settle(settled)) tell()
          }
        )
      )
    }
    return Promise.all(asking)
  }

  const fetch = (ids: readonly string[]) => {
    const fresh = [...new Set([...ids, ...missed])].filter(id => !known.has(id))
    missed.clear()
    if (fresh.length > 0) {
      for (const id of fresh) {
        known.set(id, false)
        unanswered.add(id)
      }
      if (pending.length === 0) {
        const flushed = new Promise(done => queueMicrotask(() => done(flush())))
        answered = Promise.all([answered, flushed])
      }
      pending.push(...fresh)
    }
    return answered.then(() => ids.filter(id => missed.has(id)))
  }

  const stop = watchKnown(change => {
    if (change) {
      heard(change)
      void fetch([])
      return
    }
    const asked = [...known.keys()]
    known.clear()
    void fetch(asked)
    tell()
  })

  return {
    has: id => known.get(id) === true,
    unanswered: id => unanswered.has(id) || missed.has(id),
    fetch,
    version: () => version,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    stop() {
      stop()
      listeners.clear()
    }
  }
}

export function useKnownWords(services: KnownSource): KnownWords {
  const known = useMemo(() => knownWords(services), [services])
  useEffect(() => () => known.stop(), [known])
  return known
}

export function useKnown(found: Found | null, known: KnownWords): (id: string | null) => boolean {
  useSyncExternalStore(known.subscribe, known.version)
  useEffect(() => {
    if (found) void known.fetch(wordIds(found.tokens))
  }, [found, known])
  return id => id !== null && known.has(id)
}
