import { type Failure, failure, fields } from './messages'

export type WordState = 'unknown' | 'learning' | 'known'

export const favoritesList = '2177c773-9e88-410f-9348-6cefaebe0a93'

export type CopyChange =
  | { change: 'mark'; item: string; headword: string; reading: string }
  | { change: 'clear'; item: string }
  | { change: 'set'; item: string; state: 'unknown' }
  | {
      change: 'set'
      item: string
      state: 'learning' | 'known'
      headword: string
      reading: string
    }
  | { change: 'create-list'; list: string; name: string; position: number }
  | { change: 'update-list'; list: string; name?: string; position?: number }
  | { change: 'delete-list'; list: string }
  | {
      change: 'add-word'
      list: string
      item: string
      headword: string
      reading: string
      name?: string
    }
  | { change: 'remove-word'; list: string; item: string }
  | {
      change: 'write-note'
      note: string
      item: string
      text: string
      headword: string | null
      reading: string | null
    }
  | { change: 'delete-note'; note: string }

export type CopyRequest =
  | { copy: 'read' }
  | { copy: 'change'; change: CopyChange }
  | { copy: 'sync' }
  | { copy: 'opened' }
  | { copy: 'known'; items: string[] }
  | { copy: 'word'; item: string }
  | { copy: 'word-change'; item: string; change: CopyChange }

export type SyncState =
  | 'not-synced'
  | 'syncing'
  | 'synced'
  | 'signed-out'
  | 'subscription-required'
  | 'waiting'
  | 'offline'
  | 'failed'

export type CopiedWord = { item: string; headword: string; reading: string }

export type CopiedList = {
  id: string
  name: string
  position: number
  createdAt: string
  words: (CopiedWord & { addedAt: string })[]
}

export type CopiedNote = {
  id: string
  item: string
  text: string
  headword: string | null
  reading: string | null
}

export type AccountOnlySetting = 'readingAids.translationLanguage' | 'readingAids.translationSource'

export type CopyView = {
  owner: string | null
  knownWords: CopiedWord[]
  learningWords: CopiedWord[]
  lists: CopiedList[]
  notes: CopiedNote[]
  accountSettings: Partial<Record<AccountOnlySetting, string>>
  unsynced: number
  lastSyncedAt: number | null
  sync: SyncState
}

export type WordList = { id: string; name: string; holds: boolean }

export type WordView = { state: WordState; lists: WordList[]; notes: CopiedNote[] }

export type SavingRefusal = 'signed-out' | 'subscription-required'

export type CopyAnswer =
  | { type: 'copy'; copy: CopyView }
  | { type: 'changed' }
  | { type: 'opened' }
  | { type: 'known'; known: Record<string, boolean> }
  | { type: 'word'; word: WordView }
  | { type: 'refused'; refusal: 'invalid' | SavingRefusal }
  | Failure

export type CopyEnvelope = { target: 'service-worker'; copy: CopyRequest }

export type KnownChanged = { target: 'known'; known: Record<string, boolean> | null }

export type SavingRefused = { target: 'saving'; refusal: SavingRefusal | null; page?: string }

export const knownAtOnce = 1000

export function isCopyEnvelope(message: unknown): message is CopyEnvelope {
  const envelope = fields(message)
  return envelope?.target === 'service-worker' && typeof fields(envelope.copy)?.copy === 'string'
}

type Sender = { sendMessage(message: CopyEnvelope): Promise<unknown> }

export function askCopy(request: CopyRequest, sender?: Sender): Promise<CopyAnswer> {
  return Promise.resolve()
    .then(() => (sender ?? chrome.runtime).sendMessage({ target: 'service-worker', copy: request }))
    .then(answer =>
      typeof fields(answer)?.type === 'string'
        ? (answer as CopyAnswer)
        : failure(new Error('The service worker answered without the copy.'))
    )
    .catch((error: unknown) => failure(error))
}

export async function askKnown(items: string[], sender?: Sender): Promise<Record<string, boolean>> {
  const answer = await askCopy({ copy: 'known', items }, sender)
  return answer.type === 'known' ? answer.known : {}
}

export async function askWord(item: string, sender?: Sender): Promise<WordView | null> {
  const answer = await askCopy({ copy: 'word', item }, sender)
  return answer.type === 'word' ? answer.word : null
}

export const changeWord = (item: string, change: CopyChange, sender?: Sender) =>
  askCopy({ copy: 'word-change', item, change }, sender)

type MessageEvents = {
  addListener(listener: (message: unknown) => boolean): void
  removeListener(listener: (message: unknown) => boolean): void
}

const isKnownChanged = (message: unknown): message is KnownChanged => {
  const changed = fields(message)
  return (
    changed?.target === 'known' && (changed.known === null || fields(changed.known) !== undefined)
  )
}

const savingRefusals: readonly unknown[] = [null, 'signed-out', 'subscription-required']

const isSavingRefused = (message: unknown): message is SavingRefused => {
  const told = fields(message)
  return told?.target === 'saving' && savingRefusals.includes(told.refusal)
}

function listen<Told>(
  is: (message: unknown) => message is Told,
  listener: (told: Told) => void,
  events: MessageEvents
): () => void {
  const heard = (message: unknown) => {
    if (is(message)) listener(message)
    return false
  }
  events.addListener(heard)
  return () => events.removeListener(heard)
}

export const onKnownChanged = (
  listener: (known: Record<string, boolean> | null) => void,
  events: MessageEvents = chrome.runtime.onMessage
) => listen(isKnownChanged, changed => listener(changed.known), events)

export const onSavingRefused = (
  listener: (told: SavingRefused) => void,
  events: MessageEvents = chrome.runtime.onMessage
) => listen(isSavingRefused, listener, events)
