import { describe, expect, test } from 'vitest'
import {
  AccountCopy,
  type AccountTransport,
  type Answered,
  type KindPage,
  type KindQuery,
  type Mutation,
  type MutationResult,
  type SyncedChange
} from './account-copy'
import {
  chosenPacks,
  chosenValue,
  isMarkedKnown,
  isNoteWithoutAWord,
  listMoves,
  listsInOrder,
  newestChangedFirst,
  nextListPosition,
  recentFirst,
  wordsOfList,
  wordsOfPhoto
} from './account-views'
import { recentOrderCases } from './test/cases'

type Failure = 'gone' | 'offline'

const put = (entity: string, entityId: string, version: number, data: object): SyncedChange => ({
  entity,
  entityId,
  operation: 'put',
  version,
  data: { ...data }
})
const gone = (entity: string, entityId: string, version: number): SyncedChange => ({
  entity,
  entityId,
  operation: 'delete',
  version,
  data: null
})

function scripted() {
  const reads: { entity: string; query: KindQuery }[] = []
  const sent: Mutation[] = []
  const pages: Answered<KindPage, Failure>[] = []
  const results: ((mutation: Mutation) => MutationResult)[] = []
  const transport: AccountTransport<Failure> = {
    async readKind(entity, query) {
      reads.push({ entity, query })
      return pages.shift() ?? { ok: true, value: { changes: [], cursor: 'end', hasMore: false } }
    },
    async sync(mutations) {
      sent.push(...mutations)
      const answer = results.shift()
      if (!answer) return { ok: false, failure: 'offline' }
      return { ok: true, value: mutations.map(answer) }
    },
    isStaleCursor: failure => failure === 'gone'
  }
  let ids = 0
  const copy = new AccountCopy(transport, () => `id-${++ids}`)
  const page = (cursor: string, hasMore: boolean, ...changes: SyncedChange[]) =>
    pages.push({ ok: true, value: { changes, cursor, hasMore } })
  const answer = (made: (mutation: Mutation) => MutationResult) => results.push(made)
  return { copy, reads, sent, page, answer, pages }
}

const food = '2177c773-9e88-410f-9348-6cefaebe0a93'
const word = 'a'.repeat(32)
const list = (position: number, createdAt = '2026-10-01T00:00:00.000Z') => ({
  name: 'Food',
  position,
  createdAt
})

describe("a client's copy of the account", () => {
  test('reads every page of a kind, holding each entity once, in the order the account last changed them', async () => {
    const { copy, reads, page } = scripted()
    page('one', true, put('list', 'b', 1, list(1)), put('list', 'a', 1, list(0)))
    page('two', false, put('list', 'b', 2, list(2)))
    expect(await copy.read('list')).toEqual({ ok: true, value: undefined })
    expect(copy.held('list').map(held => [held.entityId, held.version])).toEqual([
      ['a', 1],
      ['b', 2]
    ])
    expect(reads.map(read => read.query.cursor)).toEqual([undefined, 'one'])
  })

  test("sends a change at the version it holds, then reads what changed since, and a deleted list's words go with it", async () => {
    const { copy, reads, sent, page, answer } = scripted()
    page('lists', false, put('list', food, 3, list(0)))
    await copy.read('list')
    page('words', false, put('listWord', `${food}/${word}`, 1, { listId: food, itemId: word }))
    await copy.read('listWord')
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 4 }))
    page('lists-2', false, gone('list', food, 4))
    expect(await copy.change('list', 'delete', food)).toEqual({ status: 'applied' })
    expect(sent).toEqual([
      { id: 'id-1', entity: 'list', operation: 'delete', entityId: food, baseVersion: 3 }
    ])
    expect(reads.slice(2).map(read => [read.entity, read.query.cursor])).toEqual([
      ['list', 'lists'],
      ['listWord', 'words']
    ])
    expect(copy.held('listWord')).toEqual([])
    expect(copy.version('list', food)).toBe(4)
  })

  test('reads a kind again from the start when the account refuses its cursor', async () => {
    const { copy, reads, page, pages, answer } = scripted()
    page('first', false, put('knownWord', word, 1, { known: true }))
    await copy.read('knownWord', word)
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 2 }))
    pages.push({ ok: false, failure: 'gone' })
    page('again', false, put('knownWord', word, 2, { known: false }))
    expect(await copy.change('knownWord', 'clear', word)).toEqual({ status: 'applied' })
    expect(reads.map(read => read.query)).toEqual([
      { limit: 500, item: word },
      { limit: 500, cursor: 'first', item: word },
      { limit: 500, item: word }
    ])
    expect(copy.heldOne('knownWord', word)).toEqual({
      entityId: word,
      version: 2,
      data: { known: false }
    })
  })

  test('sends many changes 50 at a time, then reads each kind they touched once', async () => {
    const { copy, sent, reads, answer, page } = scripted()
    page(
      'searches',
      false,
      ...Array.from({ length: 51 }, (_, n) => put('recentSearch', `s${n}`, 1, {}))
    )
    await copy.read('recentSearch')
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 2 }))
    answer(mutation =>
      mutation.entityId === 's50'
        ? {
            id: mutation.id,
            status: 'conflict',
            version: 3,
            current: put('recentSearch', 's50', 3, {})
          }
        : { id: mutation.id, status: 'applied', version: 2 }
    )
    const removed = await copy.changeAll(
      Array.from({ length: 51 }, (_, n) => ({
        entity: 'recentSearch',
        operation: 'remove',
        entityId: `s${n}`
      }))
    )
    expect(removed.map(outcome => outcome.status)).toEqual([
      ...Array(50).fill('applied'),
      'conflict'
    ])
    expect(sent.map(mutation => mutation.baseVersion)).toEqual(Array(51).fill(1))
    expect(reads.map(read => read.query.cursor)).toEqual([undefined, 'searches'])
    expect(
      await copy.changeAll([{ entity: 'recentSearch', operation: 'remove', entityId: 's0' }])
    ).toEqual([{ status: 'failed', failure: 'offline' }])
  })

  test('says a change applied even when the read after it fails, and keeps what it showed when a read from the start fails', async () => {
    const { copy, answer, page, pages } = scripted()
    page('lists', false, put('list', food, 1, list(0)))
    await copy.read('list')
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 2 }))
    pages.push({ ok: false, failure: 'offline' })
    expect(await copy.change('list', 'update', food, { name: 'Meals' })).toEqual({
      status: 'applied',
      unread: 'offline'
    })
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 3 }))
    pages.push({ ok: false, failure: 'gone' }, { ok: false, failure: 'offline' })
    expect(await copy.change('list', 'update', food, { name: 'Food' })).toEqual({
      status: 'applied',
      unread: 'offline'
    })
    expect(copy.held('list')).toEqual([{ entityId: food, version: 1, data: list(0) }])
  })

  test('sends one change at a time, each reading the account before the next is sent', async () => {
    const { copy, sent, reads, answer, page } = scripted()
    page('lists', false, put('list', food, 1, list(0)))
    await copy.read('list')
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 2 }))
    page('lists-2', false, put('list', food, 2, list(1)))
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 3 }))
    await Promise.all([
      copy.change('list', 'update', food, { position: 1 }),
      copy.change('list', 'update', food, { position: 2 })
    ])
    expect(sent.map(mutation => mutation.baseVersion)).toEqual([1, 2])
    expect(reads.map(read => read.query.cursor)).toEqual([undefined, 'lists', 'lists-2'])
  })

  test('says why a change was refused, and passes on a failure to send it', async () => {
    const { copy, answer } = scripted()
    await copy.read('listWord')
    answer(mutation => ({
      id: mutation.id,
      status: 'rejected',
      error: { code: 'unknown_list', message: 'That list is gone.' }
    }))
    expect(await copy.change('listWord', 'add', `${food}/${word}`, { headword: '見る' })).toEqual({
      status: 'rejected',
      code: 'unknown_list',
      message: 'That list is gone.'
    })
    expect(await copy.change('listWord', 'add', `${food}/${word}`)).toEqual({
      status: 'failed',
      failure: 'offline'
    })
  })
})

describe("a note written over another device's change", () => {
  const note = (text: string, item = word) => ({ id: 'n', itemId: item, text, headword: '見る' })
  const written = (text: string) => ({ item: word, text, headword: '見る', reading: 'みる' })

  async function conflicted(theirs: SyncedChange) {
    const harness = scripted()
    harness.page('notes', false, put('wordNote', 'n', 1, note('Mine before.')))
    await harness.copy.read('wordNote', word)
    harness.answer(mutation => ({
      id: mutation.id,
      status: 'conflict',
      version: 2,
      current: theirs
    }))
    harness.page('notes-2', false, theirs)
    return harness
  }

  test("keeps the learner's text as a new note beside theirs when theirs changed the text", async () => {
    const { copy, sent, answer } = await conflicted(put('wordNote', 'n', 2, note('Theirs.')))
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 1 }))
    expect(await copy.change('wordNote', 'write', 'n', written('Mine after.'))).toEqual({
      status: 'kept-as-new',
      entityId: 'id-2'
    })
    expect(sent[1]).toMatchObject({
      entity: 'wordNote',
      operation: 'write',
      entityId: 'id-2',
      baseVersion: 0,
      fields: { item: word, text: 'Mine after.', headword: '見る' }
    })
  })

  test("writes the learner's text again, on the word theirs moved it to, when theirs only moved it", async () => {
    const moved = `kanji:${'見'}`
    const { copy, sent, answer } = await conflicted(
      put('wordNote', 'n', 2, note('Mine before.', moved))
    )
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 3 }))
    expect(await copy.change('wordNote', 'write', 'n', written('Mine after.'))).toEqual({
      status: 'applied'
    })
    expect(sent[1]).toMatchObject({
      entityId: 'n',
      baseVersion: 2,
      fields: { item: moved, text: 'Mine after.' }
    })
  })

  async function editingMyNote() {
    const harness = scripted()
    harness.page('notes', false, put('wordNote', 'n', 1, note('Mine before.')))
    await harness.copy.read('wordNote', word)
    const theirs = put('wordNote', 'n', 2, note('Theirs.'))
    const conflictsThenApplies = () => {
      harness.answer(mutation => ({
        id: mutation.id,
        status: 'conflict',
        version: 2,
        current: theirs
      }))
      harness.answer(mutation => ({ id: mutation.id, status: 'applied', version: 1 }))
    }
    return { ...harness, began: harness.copy.heldOne('wordNote', 'n'), conflictsThenApplies }
  }

  test('sends a change from the version an edit began on, whatever the copy read since', async () => {
    const { copy, sent, answer, page, began, conflictsThenApplies } = await editingMyNote()
    answer(mutation => ({ id: mutation.id, status: 'applied', version: 1 }))
    page('notes-2', false, put('wordNote', 'n', 2, note('Theirs.')))
    await copy.change('wordNote', 'write', 'other', written('Another.'))
    conflictsThenApplies()
    expect(
      await copy.change('wordNote', 'write', 'n', written('Mine after.'), began)
    ).toMatchObject({ status: 'kept-as-new' })
    expect(sent.slice(1).map(each => [each.entityId, each.baseVersion])).toEqual([
      ['n', 1],
      ['id-3', 0]
    ])
  })

  test('keeps a note it kept as new under the same ID when the learner saves again', async () => {
    const { copy, sent, began, conflictsThenApplies } = await editingMyNote()
    for (let attempt = 0; attempt < 2; attempt++) {
      conflictsThenApplies()
      await copy.change('wordNote', 'write', 'n', written('Mine after.'), began)
    }
    const keptAs = sent.filter(each => each.entityId !== 'n').map(each => each.entityId)
    expect(keptAs).toHaveLength(2)
    expect(new Set(keptAs).size).toBe(1)
  })

  test('sends nothing more when theirs already says what the learner wrote', async () => {
    const { copy, sent } = await conflicted(put('wordNote', 'n', 2, note('Same.')))
    expect(await copy.change('wordNote', 'write', 'n', written('Same.'))).toEqual({
      status: 'conflict'
    })
    expect(sent).toHaveLength(1)
  })
})

describe('a search sent without a copy of the searches', () => {
  const search = { query: '猫', searchedAt: '2026-10-27T00:00:00.000Z' }
  const searchId = 'c'.repeat(64)

  test('is sent again at the version of a removal it never saw, since the learner searched after it', async () => {
    const { copy, sent, answer, reads } = scripted()
    answer(({ id }) => ({
      id,
      status: 'conflict',
      version: 3,
      current: gone('recentSearch', searchId, 3)
    }))
    answer(({ id }) => ({ id, status: 'applied', version: 4 }))
    expect(await copy.change('recentSearch', 'search', searchId, search, null)).toEqual({
      status: 'applied'
    })
    expect(sent.map(({ baseVersion, fields }) => ({ baseVersion, fields }))).toEqual([
      { baseVersion: 0, fields: search },
      { baseVersion: 3, fields: search }
    ])
    expect(reads).toEqual([])
  })

  test('applies at once where the account has the search, or never had it', async () => {
    const { copy, sent, answer } = scripted()
    answer(({ id }) => ({ id, status: 'applied', version: 2 }))
    expect(await copy.change('recentSearch', 'search', searchId, search, null)).toEqual({
      status: 'applied'
    })
    expect(sent).toHaveLength(1)
  })

  test('passes on a failure to send it again', async () => {
    const { copy, answer } = scripted()
    answer(({ id }) => ({
      id,
      status: 'conflict',
      version: 3,
      current: gone('recentSearch', searchId, 3)
    }))
    expect(await copy.change('recentSearch', 'search', searchId, search, null)).toEqual({
      status: 'failed',
      failure: 'offline'
    })
  })
})

describe("the account's data, shown as the apps show it", () => {
  const held = (entityId: string, data: object | null, version = 1) => ({
    entityId,
    version,
    data: data && { ...data }
  })

  test('lists in their order, then by when each was made, then by ID, as the app orders two in one place', () => {
    const lists = [
      held('c', list(1, '2026-10-02T00:00:00.000Z')),
      held('b', list(1, '2026-10-01T00:00:00.000Z')),
      held('a', list(1, '2026-10-01T00:00:00.000Z')),
      held('z', list(0)),
      held('gone', null)
    ]
    expect(listsInOrder(lists).map(each => each.entityId)).toEqual(['z', 'a', 'b', 'c'])
    expect(nextListPosition(lists)).toBe(2)
    expect(nextListPosition([])).toBe(0)
  })

  test('a list moved to another place renumbers only the lists whose place changed', () => {
    const ordered = listsInOrder([held('a', list(0)), held('b', list(1)), held('c', list(2))])
    expect(listMoves(ordered, 2, 0)).toEqual([
      { entityId: 'c', position: 0 },
      { entityId: 'a', position: 1 },
      { entityId: 'b', position: 2 }
    ])
    expect(listMoves(ordered, 0, 1)).toEqual([
      { entityId: 'b', position: 0 },
      { entityId: 'a', position: 1 }
    ])
  })

  test("a list's words, most recently added first; recent videos and searches as the shared order says", () => {
    const words = [
      held(`${food}/1`, { addedAt: '2026-10-01T00:00:00.000Z' }),
      held(`${food}/2`, { addedAt: '2026-10-03T00:00:00.000Z' }),
      held(`other/3`, { addedAt: '2026-10-04T00:00:00.000Z' }),
      held(`${food}/4`, null)
    ]
    expect(wordsOfList(words, food).map(each => each.entityId)).toEqual([`${food}/2`, `${food}/1`])
    const onAPhoto = [
      held('p/1', { savedAt: '2026-10-01T00:00:00.000Z' }),
      held('p/2', { savedAt: '2026-10-02T00:00:00.000Z' })
    ]
    expect(wordsOfPhoto(onAPhoto, 'p').map(each => each.entityId)).toEqual(['p/2', 'p/1'])
    const { ids, newestFirst } = recentOrderCases.videos
    const videos = ids.map(id => held(id, { watchedAt: '2026-10-01T00:00:00.000Z' }))
    expect(recentFirst(videos, 'watchedAt').map(each => each.entityId)).toEqual(newestFirst)
    expect(newestChangedFirst([held('a', {}), held('b', {}), held('c', null)])).toMatchObject([
      { entityId: 'b' },
      { entityId: 'a' }
    ])
  })

  test('shows a word Known only when the account says known, so a Learning word is not known to a client that shows only Known', () => {
    const word = { itemId: 'a'.repeat(32), headword: '見る', reading: 'みる' }
    expect(isMarkedKnown({ ...word, state: 'known', known: true })).toBe(true)
    expect(isMarkedKnown({ ...word, state: 'learning', known: false })).toBe(false)
    expect(isMarkedKnown({ ...word, state: 'unknown', known: false })).toBe(false)
    expect(isMarkedKnown({ ...word, known: true })).toBe(true)
    expect(isMarkedKnown(null)).toBe(false)
  })

  test('names notes without a word, and reads and writes the chosen frequency dictionaries', () => {
    expect(isNoteWithoutAWord(`wn1:${'a'.repeat(64)}`)).toBe(true)
    expect(isNoteWithoutAWord(word)).toBe(false)
    expect(chosenPacks('')).toEqual([])
    expect(chosenPacks('zenbu.jlpt,zenbu.tubelex')).toEqual(['zenbu.jlpt', 'zenbu.tubelex'])
    expect(chosenValue(['zenbu.jlpt', 'zenbu.tubelex'])).toBe('zenbu.jlpt,zenbu.tubelex')
    expect(chosenValue([])).toBe('')
  })
})
