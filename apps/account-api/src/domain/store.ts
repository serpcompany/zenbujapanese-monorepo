import type { EditableProfile, Profile, RejectionCode } from './profile'

export type EntityType = 'profile' | 'knownWord' | 'list' | 'listWord'

export interface JournalEntry {
  sequence: number
  entityType: string
  entityId: string
  entityVersion: number
  operation: string
}

export interface KnownWord {
  itemId: string
  headword: string
  reading: string
  known: boolean
  version: number
  updatedAt: Date
}

export interface WordList {
  id: string
  name: string
  position: number
  deleted: boolean
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface ListWord {
  listId: string
  itemId: string
  headword: string
  reading: string
  present: boolean
  version: number
  addedAt: Date
  updatedAt: Date
}

type MutationOutcome = 'applied' | 'conflict' | 'rejected'

export interface MutationRecord {
  clientMutationId: string
  entityType: string
  entityId: string | null
  operation: string
  requestSha256: string
  outcome: MutationOutcome
  resultingServerVersion: number | null
  errorCode: RejectionCode | null
}

export type RecordedMutation = Omit<MutationRecord, 'outcome' | 'errorCode'> & {
  outcome: string
  errorCode: string | null
}

export interface EntityReader {
  currentProfile(): Promise<Profile | null>
  knownWord(itemId: string): Promise<KnownWord | null>
  wordList(listId: string): Promise<WordList | null>
  listWord(listId: string, itemId: string): Promise<ListWord | null>
}

export interface LockedAccount extends EntityReader {
  readonly profile: Profile
  saveProfile(next: EditableProfile, version: number): Promise<Profile | 'username_taken'>
  saveKnownWord(word: Omit<KnownWord, 'updatedAt'>): Promise<void>
  wordListCount(): Promise<number>
  saveWordList(list: Omit<WordList, 'createdAt' | 'updatedAt'>): Promise<void>
  listWordCount(listId: string): Promise<number>
  saveListWord(word: Omit<ListWord, 'addedAt' | 'updatedAt'>): Promise<void>
  dropListWords(listId: string): Promise<void>
  journal(entry: Omit<JournalEntry, 'sequence'>): Promise<void>
  recordedMutation(clientMutationId: string): Promise<RecordedMutation | null>
  recordMutation(record: MutationRecord): Promise<void>
  forgetMutationsOlderThan(days: number): Promise<void>
}

export interface AccountStore {
  profile(userId: string): Promise<Profile | null>
  identityProviders(userId: string): Promise<string[]>
  deleteAccount(userId: string, email: string): Promise<void>
  reader(userId: string): EntityReader
  withLockedAccount<T>(
    userId: string,
    work: (account: LockedAccount) => Promise<T>
  ): Promise<T | null>
  changesAfter(userId: string, sequence: number, limit: number): Promise<JournalEntry[]>
  journalHead(): Promise<number>
}
