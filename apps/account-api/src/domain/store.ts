import type { EditableProfile, Profile, RejectionCode } from './profile'

export type EntityType = 'profile'

export interface JournalEntry {
  sequence: number
  entityType: string
  entityId: string
  entityVersion: number
  operation: string
}

export type MutationOutcome = 'applied' | 'conflict' | 'rejected'

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

export interface LockedAccount {
  readonly profile: Profile
  saveProfile(next: EditableProfile, version: number): Promise<Profile | 'username_taken'>
  journal(entry: Omit<JournalEntry, 'sequence'>): Promise<void>
  recordedMutation(clientMutationId: string): Promise<MutationRecord | null>
  recordMutation(record: MutationRecord): Promise<void>
}

export interface AccountStore {
  profile(userId: string): Promise<Profile | null>
  withLockedAccount<T>(
    userId: string,
    work: (account: LockedAccount) => Promise<T>
  ): Promise<T | null>
  changesAfter(userId: string, sequence: number, limit: number): Promise<JournalEntry[]>
  journalHead(): Promise<number>
}
