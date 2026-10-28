import { dailyListId } from '@zenbu/account-rules/daily-lists'
import { listLimits, listName } from '@zenbu/account-rules/lists'
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
  listWordEntityId,
  listWordSeparator,
  needsBaseVersion,
  rejected,
  uuidOf
} from './entities'
import { isRejection, type Rejection, rejection } from './profile'
import type { ListWord, LockedAccount, WordList } from './store'

export { listLimits }

const badList = rejection('invalid_mutation', "A list's entityId is its UUID.")
const badListWord = rejection(
  'invalid_mutation',
  "A list word's entityId is the list's UUID, a slash, and the item: `<list>/<item>`."
)
const taken = rejection('already_exists', 'A list with that ID already exists, or did.')
const tooMany = rejection('too_many_lists', `An account holds at most ${listLimits.lists} lists.`)
const full = rejection('list_full', `A list holds at most ${listLimits.wordsPerList} words.`)
const noList = rejection('unknown_list', 'That list is not in this account, or was deleted.')
const badFields = rejection(
  'invalid_fields',
  `A list has a name of 1 to ${listLimits.nameLength} characters once trimmed, and a position, a whole number from 0 to ${listLimits.position}. Only those change.`
)

const listIdOf = uuidOf

const firstDailyList = Date.UTC(2026, 9, 1)
const dayLength = 86_400_000

function uncountedDailyLists(now: Date): string[] {
  const ids: string[] = []
  for (let day = firstDailyList; day <= now.getTime() + dayLength; day += dayLength) {
    const id = dailyListId(new Date(day).toISOString().slice(0, 10))
    if (id) ids.push(id)
  }
  return ids
}

async function holdsTooMany(account: LockedAccount, id: string) {
  const uncounted = uncountedDailyLists(new Date())
  if (uncounted.includes(id)) return false
  return (await account.wordListCount(uncounted)) >= listLimits.lists
}

const nameOf = (raw: unknown) => (typeof raw === 'string' ? listName(raw) : null)

const listChange = (list: WordList): Change =>
  list.deleted
    ? gone('list', list.id, list.version)
    : {
        entity: 'list',
        entityId: list.id,
        operation: 'put',
        version: list.version,
        data: { id: list.id, name: list.name, position: list.position, createdAt: list.createdAt }
      }

const listWordChange = (word: ListWord): Change =>
  word.present
    ? {
        entity: 'listWord',
        entityId: listWordEntityId(word.listId, word.itemId),
        operation: 'put',
        version: word.version,
        data: {
          listId: word.listId,
          itemId: word.itemId,
          headword: word.headword,
          reading: word.reading,
          addedAt: word.addedAt
        }
      }
    : gone('listWord', listWordEntityId(word.listId, word.itemId), word.version)

function listFields(
  fields: Record<string, unknown>,
  current?: WordList
): { name: string; position: number } | Rejection {
  const keys = Object.keys(fields)
  if (keys.length === 0 || keys.some(key => key !== 'name' && key !== 'position')) return badFields
  const name = 'name' in fields ? nameOf(fields.name) : (current?.name ?? null)
  const position = 'position' in fields ? fields.position : current?.position
  if (
    name === null ||
    typeof position !== 'number' ||
    !Number.isInteger(position) ||
    position < 0 ||
    position > listLimits.position
  ) {
    return badFields
  }
  return { name, position }
}

async function saveList(
  account: LockedAccount,
  list: Omit<WordList, 'createdAt' | 'updatedAt'>,
  operation: string
) {
  await account.saveWordList(list)
  return journaled(account, 'list', list.id, list.version, operation)
}

const writes = ['lists:write'] as const

export const wordLists: Entity = {
  reads: 'lists:read',
  operations: {
    create: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = listIdOf(mutation.entityId)
        if (!id) return rejected(badList)
        if (await account.wordList(id)) return rejected(taken)
        if (await holdsTooMany(account, id)) return rejected(tooMany)
        const fields = mutation.fields ?? {}
        if (!('name' in fields && 'position' in fields)) return rejected(badFields)
        const checked = listFields(fields)
        if (isRejection(checked)) return rejected(checked)
        return saveList(account, { id, ...checked, deleted: false, version: 1 }, 'create')
      }
    },
    update: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = listIdOf(mutation.entityId)
        if (!id) return rejected(badList)
        if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
        const current = await account.wordList(id)
        if (!current || current.deleted) {
          return conflict(current ? listChange(current) : gone('list', id, 0))
        }
        const checked = listFields(mutation.fields ?? {}, current)
        if (isRejection(checked)) return rejected(checked)
        if (checked.name === current.name && checked.position === current.position) {
          return applied(current.version)
        }
        if (mutation.baseVersion !== current.version) return conflict(listChange(current))
        const version = current.version + 1
        return saveList(account, { id, ...checked, deleted: false, version }, 'update')
      }
    },
    delete: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = listIdOf(mutation.entityId)
        if (!id) return rejected(badList)
        const current = await account.wordList(id)
        if (!current || current.deleted) return applied(current?.version ?? 0)
        await account.dropListWords(id)
        const version = current.version + 1
        return saveList(account, { ...current, name: '', deleted: true, version }, 'delete')
      }
    }
  },
  async current(reader, entityId) {
    const id = listIdOf(entityId) ?? entityId
    const list = await reader.wordList(id)
    return list ? listChange(list) : gone('list', id, 0)
  }
}

function listWordIdOf(entityId: string | undefined) {
  const at = (entityId ?? '').indexOf(listWordSeparator)
  if (at < 0) return null
  const list = listIdOf(entityId?.slice(0, at))
  const item = itemIdOf(entityId?.slice(at + listWordSeparator.length))
  return list && item ? { list, item } : null
}

async function saveListWord(
  account: LockedAccount,
  word: Omit<ListWord, 'addedAt' | 'updatedAt'>,
  operation: string
) {
  await account.saveListWord(word)
  return journaled(
    account,
    'listWord',
    listWordEntityId(word.listId, word.itemId),
    word.version,
    operation
  )
}

const listWordIdRejection = (mutation: ClientMutation) =>
  rejected(mutation.entityId?.includes(listWordSeparator) ? badItem : badListWord)

export const listWords: Entity = {
  reads: 'lists:read',
  operations: {
    add: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = listWordIdOf(mutation.entityId)
        if (!id) return listWordIdRejection(mutation)
        const list = await account.wordList(id.list)
        if (!list || list.deleted) return rejected(noList)
        const current = await account.listWord(id.list, id.item)
        if (current?.present) return applied(current.version)
        if ((await account.listWordCount(id.list)) >= listLimits.wordsPerList) return rejected(full)
        const text = itemText(mutation.fields ?? {})
        if (isRejection(text)) return rejected(text)
        const version = (current?.version ?? 0) + 1
        return saveListWord(
          account,
          { listId: id.list, itemId: id.item, ...text, present: true, version },
          'add'
        )
      }
    },
    remove: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = listWordIdOf(mutation.entityId)
        if (!id) return listWordIdRejection(mutation)
        if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
        const current = await account.listWord(id.list, id.item)
        if (!current?.present) return applied(current?.version ?? 0)
        if (mutation.baseVersion !== current.version) return conflict(listWordChange(current))
        const version = current.version + 1
        return saveListWord(account, { ...current, present: false, version }, 'remove')
      }
    }
  },
  async current(reader, entityId) {
    const id = listWordIdOf(entityId)
    const word = id ? await reader.listWord(id.list, id.item) : null
    return word ? listWordChange(word) : gone('listWord', entityId, 0)
  }
}
