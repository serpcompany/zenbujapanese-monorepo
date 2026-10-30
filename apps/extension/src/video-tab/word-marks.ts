import { isContentWord } from '@zenbu/dictionary-core/browse/content-words'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { type GlossCache, glossCache } from '../page-lookup/glosses'
import { type Found, wordIds } from '../page-lookup/rendering'
import { knownAtOnce } from '../shared/account-copy'
import type { VideoTabServices } from './services'

export type CaptionGlosses = GlossCache & { functionWords: ReadonlySet<string> }

export function captionGlosses(services: Pick<VideoTabServices, 'popupCard'>): CaptionGlosses {
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

export type KnownWords = {
  has(id: string): boolean
  fetch(ids: readonly string[]): void
  version(): number
  subscribe(listener: () => void): () => void
  stop(): void
}

function knownWords({
  knownWords: ask,
  watchKnown
}: Pick<VideoTabServices, 'knownWords' | 'watchKnown'>): KnownWords {
  const known = new Map<string, boolean>()
  const listeners = new Set<() => void>()
  let pending: string[] = []
  let version = 0

  const tell = () => {
    version += 1
    for (const listener of [...listeners]) listener()
  }

  const heard = (answer: Record<string, boolean>) => {
    const changed = Object.entries(answer).filter(
      ([id, now]) => known.has(id) && known.get(id) !== now
    )
    for (const [id, now] of changed) known.set(id, now)
    if (changed.length > 0) tell()
  }

  const flush = () => {
    const asked = pending
    pending = []
    for (let at = 0; at < asked.length; at += knownAtOnce)
      ask(asked.slice(at, at + knownAtOnce)).then(heard, () => undefined)
  }

  const fetch = (ids: readonly string[]) => {
    const fresh = [...new Set(ids)].filter(id => !known.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) known.set(id, false)
    if (pending.length === 0) queueMicrotask(flush)
    pending.push(...fresh)
  }

  const stop = watchKnown(change => {
    if (change) return heard(change)
    const asked = [...known.keys()]
    known.clear()
    tell()
    fetch(asked)
  })

  return {
    has: id => known.get(id) === true,
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

export function useKnownWords(services: VideoTabServices): KnownWords {
  const known = useMemo(() => knownWords(services), [services])
  useEffect(() => () => known.stop(), [known])
  return known
}

export function useKnown(found: Found | null, known: KnownWords): (id: string | null) => boolean {
  useSyncExternalStore(known.subscribe, known.version)
  useEffect(() => {
    if (found) known.fetch(wordIds(found.tokens))
  }, [found, known])
  return id => id !== null && known.has(id)
}
