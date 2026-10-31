import { useEffect, useState } from 'react'
import { backoff, type Wait } from '../page-lookup/scan'
import {
  askKnown,
  askSaving,
  onKnownChanged,
  onSavingRefused,
  type SavingRefusal
} from '../shared/account-copy'
import { type CountedWordsAnswer, countWords, type Lookup } from '../shared/dictionary'
import type { KnownSource, KnownWords } from './word-marks'

export type ShareServices = KnownSource & {
  countWords(lines: string[]): Lookup<CountedWordsAnswer>
  savingRefusal(): Promise<SavingRefusal | null>
  watchSaving(heard: (refusal: SavingRefusal | null) => void): () => void
  wait: Wait
}

export const onDeviceShareServices: Omit<ShareServices, 'wait'> = {
  knownWords: items => askKnown(items),
  watchKnown: heard => onKnownChanged(heard),
  countWords: lines => countWords(lines),
  savingRefusal: () => askSaving(),
  watchSaving: heard => onSavingRefused(told => heard(told.refusal))
}

export type Share = 'hidden' | 'counting' | { known: number; total: number }

export type KnownShare = {
  share(): Share
  subscribe(listener: () => void): () => void
  stop(): void
}

export const linesPerCount = 20

async function counted(
  lines: readonly string[],
  services: ShareServices,
  live: () => boolean
): Promise<string[] | null> {
  const ids: string[] = []
  const delay = backoff(services.wait)
  for (let at = 0; at < lines.length && live(); ) {
    const answer = await services.countWords(lines.slice(at, at + linesPerCount))
    if (answer.type === 'not-ready') await delay.wait()
    else if (answer.type !== 'counted-words') return null
    else {
      delay.reset()
      ids.push(...answer.ids)
      at += linesPerCount
    }
  }
  return live() ? ids : null
}

const sameShare = (left: Share, right: Share) =>
  typeof left === 'string' || typeof right === 'string'
    ? left === right
    : left.known === right.known && left.total === right.total

export function knownShare(
  lines: readonly { text: string }[],
  services: ShareServices,
  known: KnownWords
): KnownShare {
  const texts = lines.map(line => line.text)
  const listeners = new Set<() => void>()
  let live = true
  let allowed = false
  let counting = false
  let told = false
  let ids: string[] | null | undefined
  let shown: Share = 'hidden'

  const update = () => {
    const next: Share =
      !allowed || ids === null
        ? 'hidden'
        : ids === undefined || ids.length === 0
          ? 'counting'
          : { known: ids.filter(id => known.has(id)).length, total: ids.length }
    if (sameShare(next, shown)) return
    shown = next
    for (const listener of [...listeners]) listener()
  }

  const count = () => {
    if (counting) return
    counting = true
    void counted(texts, services, () => live).then(async found => {
      if (found) await known.fetch(found)
      if (!live) return
      ids = found
      update()
    })
  }

  const allow = (refusal: SavingRefusal | null) => {
    allowed = refusal === null
    if (allowed) count()
    update()
  }

  const unwatchSaving = services.watchSaving(refusal => {
    told = true
    allow(refusal)
  })
  void services.savingRefusal().then(refusal => {
    if (live && !told) allow(refusal)
  })
  const unwatchKnown = known.subscribe(update)

  return {
    share: () => shown,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    stop() {
      live = false
      unwatchSaving()
      unwatchKnown()
      listeners.clear()
    }
  }
}

export function useKnownShare(
  lines: readonly { text: string }[],
  services: ShareServices,
  known: KnownWords
): Share {
  const [share, setShare] = useState<Share>('hidden')
  useEffect(() => {
    const store = knownShare(lines, services, known)
    setShare(store.share())
    store.subscribe(() => setShare(store.share()))
    return store.stop
  }, [lines, services, known])
  return share
}

export const shareFraction = ({ known, total }: { known: number; total: number }) => known / total

export function shareTone(fraction: number): string {
  if (fraction < 0.25) return 'text-red-600 dark:text-red-400'
  if (fraction < 0.5) return 'text-orange-700 dark:text-orange-400'
  if (fraction < 0.75) return 'text-yellow-700 dark:text-yellow-400'
  return 'text-green-700 dark:text-green-400'
}
