import {
  applied,
  badItem,
  type Change,
  type ClientMutation,
  conflict,
  type Entity,
  gone,
  isItemId,
  itemText,
  needsBaseVersion,
  type Outcome,
  rejected
} from './entities'
import { isRejection, normalizeName, rejection } from './profile'
import type { ListWord, LockedAccount, WordList } from './store'

const listLimits = { lists: 500, wordsPerList: 5000, position: 100_000 } as const

const listId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const badList = rejection('invalid_mutation', "A list's entityId is its UUID, in lowercase.")
const badListWord = rejection(
  'invalid_mutation',
  "A list word's entityId is the list's UUID, a slash, and the item: `<list>/<item>`."
)
const taken = rejection('already_exists', 'A list with that ID already exists, or did.')
const tooMany = rejection('too_many_lists', `An account holds at most ${listLimits.lists} lists.`)
const full = rejection('list_full', `A list holds at most ${listLimits.wordsPerList} words.`)
const noList = rejection('unknown_list', 'That list is not in this account, or was deleted.')
const nothingToChange = rejection('invalid_fields', 'Send name, position, or both.')

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
        entityId: `${word.listId}/${word.itemId}`,
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
    : gone('listWord', `${word.listId}/${word.itemId}`, word.version)

function listFields(fields: Record<string, unknown>, current?: WordList) {
  const name = 'name' in fields ? normalizeName(fields.name) : (current?.name ?? null)
  if (isRejection(name)) return name
  const position = 'position' in fields ? fields.position : current?.position
  if (
    name === null ||
    typeof position !== 'number' ||
    !Number.isInteger(position) ||
    position < 0 ||
    position > listLimits.position
  ) {
    return rejection(
      'invalid_fields',
      `A list has a name and a position, a whole number from 0 to ${listLimits.position}.`
    )
  }
  return { name, position }
}

async function journalList(
  account: LockedAccount,
  list: { id: string; version: number },
  operation: string
) {
  await account.journal({
    entityType: 'list',
    entityId: list.id,
    entityVersion: list.version,
    operation
  })
}

async function listAtVersion(
  account: LockedAccount,
  mutation: ClientMutation
): Promise<Outcome | { id: string; current: WordList | null }> {
  const id = mutation.entityId ?? ''
  if (!listId.test(id)) return rejected(badList)
  if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
  return { id, current: await account.wordList(id) }
}

export const wordLists: Entity = {
  operations: {
    async create(account, mutation) {
      const id = mutation.entityId ?? ''
      if (!listId.test(id)) return rejected(badList)
      if (await account.wordList(id)) return rejected(taken)
      if ((await account.wordListCount()) >= listLimits.lists) return rejected(tooMany)
      const fields = listFields(mutation.fields ?? {})
      if (isRejection(fields)) return rejected(fields)
      const list = { id, ...fields, deleted: false, version: 1 }
      await account.saveWordList(list)
      await journalList(account, list, 'create')
      return applied(list.version)
    },
    async update(account, mutation) {
      const found = await listAtVersion(account, mutation)
      if ('status' in found) return found
      const { id, current } = found
      if (!current || current.deleted) {
        return conflict(current ? listChange(current) : gone('list', id, 0))
      }
      if (mutation.baseVersion !== current.version) return conflict(listChange(current))
      if (Object.keys(mutation.fields ?? {}).length === 0) return rejected(nothingToChange)
      const fields = listFields(mutation.fields ?? {}, current)
      if (isRejection(fields)) return rejected(fields)
      if (fields.name === current.name && fields.position === current.position) {
        return applied(current.version)
      }
      const list = { id, ...fields, deleted: false, version: current.version + 1 }
      await account.saveWordList(list)
      await journalList(account, list, 'update')
      return applied(list.version)
    },
    async delete(account, mutation) {
      const found = await listAtVersion(account, mutation)
      if ('status' in found) return found
      const { id, current } = found
      if (!current || current.deleted) return applied(current?.version ?? 0)
      if (mutation.baseVersion !== current.version) return conflict(listChange(current))
      const list = { ...current, deleted: true, version: current.version + 1 }
      await account.saveWordList(list)
      await account.dropListWords(id)
      await journalList(account, list, 'delete')
      return applied(list.version)
    }
  },
  async current(reader, id) {
    const list = await reader.wordList(id)
    return list ? listChange(list) : gone('list', id, 0)
  }
}

function listWordId(entityId: string | undefined) {
  const [list = '', item = '', ...rest] = (entityId ?? '').split('/')
  return listId.test(list) && isItemId(item) && rest.length === 0 ? { list, item } : null
}

export const listWords: Entity = {
  operations: {
    async add(account, mutation) {
      const id = listWordId(mutation.entityId)
      if (!id) return rejected(mutation.entityId?.includes('/') ? badItem : badListWord)
      const list = await account.wordList(id.list)
      if (!list || list.deleted) return rejected(noList)
      const current = await account.listWord(id.list, id.item)
      if (current?.present) return applied(current.version)
      if ((await account.listWordCount(id.list)) >= listLimits.wordsPerList) return rejected(full)
      const text = itemText(mutation.fields ?? {})
      if (isRejection(text)) return rejected(text)
      const word = {
        listId: id.list,
        itemId: id.item,
        ...text,
        present: true,
        version: (current?.version ?? 0) + 1
      }
      await account.saveListWord(word)
      await account.journal({
        entityType: 'listWord',
        entityId: `${id.list}/${id.item}`,
        entityVersion: word.version,
        operation: 'add'
      })
      return applied(word.version)
    },
    async remove(account, mutation) {
      const id = listWordId(mutation.entityId)
      if (!id) return rejected(mutation.entityId?.includes('/') ? badItem : badListWord)
      if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
      const current = await account.listWord(id.list, id.item)
      if (!current?.present) return applied(current?.version ?? 0)
      if (mutation.baseVersion !== current.version) return conflict(listWordChange(current))
      const word = { ...current, present: false, version: current.version + 1 }
      await account.saveListWord(word)
      await account.journal({
        entityType: 'listWord',
        entityId: `${id.list}/${id.item}`,
        entityVersion: word.version,
        operation: 'remove'
      })
      return applied(word.version)
    }
  },
  async current(reader, entityId) {
    const id = listWordId(entityId)
    const word = id ? await reader.listWord(id.list, id.item) : null
    return word ? listWordChange(word) : gone('listWord', entityId, 0)
  }
}
