import {
  applied,
  badItem,
  type Change,
  type ClientMutation,
  conflict,
  type Entity,
  gone,
  itemIdOf,
  itemText,
  journaled,
  needsBaseVersion,
  type Outcome,
  rejected
} from './entities'
import { isRejection, type Rejection, rejection } from './profile'
import type { KnownWord, LockedAccount } from './store'
import { isWordState, type WordState, wordStates } from './word-states'

type Move = (current: WordState) => WordState

const asChange = (word: KnownWord): Change => ({
  entity: 'knownWord',
  entityId: word.itemId,
  operation: 'put',
  version: word.version,
  data: {
    itemId: word.itemId,
    headword: word.headword,
    reading: word.reading,
    state: word.state,
    known: word.state === 'known'
  }
})

const currentOf = (itemId: string, word: KnownWord | null) =>
  word ? asChange(word) : gone('knownWord', itemId, 0)

const badState = rejection(
  'invalid_fields',
  `state is one of ${wordStates.map(state => `\`${state}\``).join(', ')}.`
)

const toKnown: Move = () => 'known'
const outOfKnown: Move = current => (current === 'known' ? 'unknown' : current)

function toSent(fields: Record<string, unknown> | undefined): Move | Rejection {
  const state = fields?.state
  return isWordState(state) ? () => state : badState
}

async function moved(
  account: LockedAccount,
  mutation: ClientMutation,
  move: Move | Rejection
): Promise<Outcome> {
  const itemId = itemIdOf(mutation.entityId)
  if (!itemId) return rejected(badItem)
  if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
  if (isRejection(move)) return rejected(move)
  const current = await account.knownWord(itemId)
  const version = current?.version ?? 0
  const state = move(current?.state ?? 'unknown')
  if ((current?.state ?? 'unknown') === state) return applied(version)
  if (mutation.baseVersion !== version) return conflict(currentOf(itemId, current))
  const text =
    state === 'unknown'
      ? { headword: current?.headword ?? '', reading: current?.reading ?? '' }
      : itemText(mutation.fields ?? {})
  if (isRejection(text)) return rejected(text)
  const next = { itemId, ...text, state, version: version + 1 }
  await account.saveKnownWord(next)
  return journaled(account, 'knownWord', itemId, next.version, mutation.operation)
}

export const knownWords: Entity = {
  reads: 'known:read',
  operations: {
    set: {
      needs: ['known:write'],
      apply: (account, mutation) => moved(account, mutation, toSent(mutation.fields))
    },
    mark: {
      needs: ['known:write', 'known:mark'],
      apply: (account, mutation) => moved(account, mutation, toKnown)
    },
    clear: {
      needs: ['known:write'],
      apply: (account, mutation) => moved(account, mutation, outOfKnown)
    }
  },
  async current(reader, entityId) {
    const itemId = itemIdOf(entityId) ?? entityId
    return currentOf(itemId, await reader.knownWord(itemId))
  }
}
