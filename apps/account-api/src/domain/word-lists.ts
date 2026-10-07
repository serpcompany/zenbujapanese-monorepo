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
  listWordEntityId,
  listWordSeparator,
  needsBaseVersion,
  plainText,
  rejected
} from './entities'
import { isRejection, type Rejection, rejection } from './profile'
import type { ListWord, LockedAccount, WordList } from './store'

const listLimits = {
  lists: 500,
  wordsPerList: 5000,
  position: 100_000,
  nameLength: 500
} as const

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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

const listIdOf = (raw: string | undefined) => (raw && uuid.test(raw) ? raw.toLowerCase() : null)

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

function listName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = plainText(raw)
  const length = [...name].length
  return length > 0 && length <= listLimits.nameLength ? name : null
}

function listFields(
  fields: Record<string, unknown>,
  current?: WordList
): { name: string; position: number } | Rejection {
  const keys = Object.keys(fields)
  if (keys.length === 0 || keys.some(key => key !== 'name' && key !== 'position')) return badFields
  const name = 'name' in fields ? listName(fields.name) : (current?.name ?? null)
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
  await account.journal({
    entityType: 'list',
    entityId: list.id,
    entityVersion: list.version,
    operation
  })
  return applied(list.version)
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
        if ((await account.wordListCount()) >= listLimits.lists) return rejected(tooMany)
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
  await account.journal({
    entityType: 'listWord',
    entityId: listWordEntityId(word.listId, word.itemId),
    entityVersion: word.version,
    operation
  })
  return applied(word.version)
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
