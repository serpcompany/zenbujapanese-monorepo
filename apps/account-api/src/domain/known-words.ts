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
  needsBaseVersion,
  type Outcome,
  rejected
} from './entities'
import { isRejection } from './profile'
import type { KnownWord, LockedAccount } from './store'

const asChange = (word: KnownWord): Change => ({
  entity: 'knownWord',
  entityId: word.itemId,
  operation: 'put',
  version: word.version,
  data: {
    itemId: word.itemId,
    headword: word.headword,
    reading: word.reading,
    known: word.known
  }
})

const currentOf = (itemId: string, word: KnownWord | null) =>
  word ? asChange(word) : gone('knownWord', itemId, 0)

async function setKnown(
  account: LockedAccount,
  mutation: ClientMutation,
  known: boolean
): Promise<Outcome> {
  const itemId = itemIdOf(mutation.entityId)
  if (!itemId) return rejected(badItem)
  if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
  const current = await account.knownWord(itemId)
  const version = current?.version ?? 0
  if ((current?.known ?? false) === known) return applied(version)
  if (mutation.baseVersion !== version) return conflict(currentOf(itemId, current))
  const text = known
    ? itemText(mutation.fields ?? {})
    : { headword: current?.headword ?? '', reading: current?.reading ?? '' }
  if (isRejection(text)) return rejected(text)
  const next = { itemId, ...text, known, version: version + 1 }
  await account.saveKnownWord(next)
  await account.journal({
    entityType: 'knownWord',
    entityId: itemId,
    entityVersion: next.version,
    operation: mutation.operation
  })
  return applied(next.version)
}

export const knownWords: Entity = {
  reads: 'known:read',
  operations: {
    mark: {
      needs: ['known:write', 'known:mark'],
      apply: (account, mutation) => setKnown(account, mutation, true)
    },
    clear: {
      needs: ['known:write'],
      apply: (account, mutation) => setKnown(account, mutation, false)
    }
  },
  async current(reader, entityId) {
    const itemId = itemIdOf(entityId) ?? entityId
    return currentOf(itemId, await reader.knownWord(itemId))
  }
}
