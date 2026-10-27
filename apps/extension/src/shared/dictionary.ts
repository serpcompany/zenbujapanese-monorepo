import type { DataState } from './data-state'
import type { Failure } from './messages'

export type StateAnswer = { type: 'state'; data: DataState }

const notBuilt: Failure = { type: 'failed', reason: 'The dictionary lookups come with #956.' }
const stub = () => Promise.resolve(notBuilt)

export const checkForUpdates: () => Promise<StateAnswer | Failure> = stub
export const openWelcomeTab = (): Promise<void> => Promise.resolve()
