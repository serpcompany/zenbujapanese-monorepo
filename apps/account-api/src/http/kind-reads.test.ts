import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { deleted, type KindAnswer, type Learner, useAccountService } from '../test/accounts'
import { photoChanges, uploaded, wordItem } from '../test/photos'

const accounts = useAccountService()

const text = { headword: '見る', reading: 'みる' }

const aList = (id: string, name: string, position: number) => ({
  entity: 'list',
  operation: 'create',
  entityId: id,
  fields: { name, position }
})
const onList = (list: string, item: string) => ({
  entity: 'listWord',
  operation: 'add',
  entityId: `${list}/${item}`,
  fields: text
})
const aNote = (item: string, words: string) => ({
  entity: 'wordNote',
  operation: 'write',
  entityId: randomUUID(),
  baseVersion: 0,
  fields: { item, text: words }
})

const send = (learner: Learner, ...mutations: Record<string, unknown>[]) =>
  accounts.mutate(learner.token, ...mutations)

const page = (answer: { body: Record<string, unknown> | null }) =>
  answer.body as unknown as KindAnswer

const idsOf = (changes: { entityId: string }[]) => changes.map(change => change.entityId)

describe('reading one kind', () => {
  test('answers each entity of the kind as sync does, oldest change first, a page at a time', async () => {
    const learner = await accounts.learner('kind-pages@example.com')
    const [first, second, third] = [randomUUID(), randomUUID(), randomUUID()]
    await send(
      learner,
      aList(first, 'One', 0),
      aList(second, 'Two', 1),
      aList(third, 'Three', 2),
      onList(first, wordItem(1))
    )
    await send(learner, {
      entity: 'list',
      operation: 'update',
      entityId: first,
      baseVersion: 1,
      fields: { name: 'One again' }
    })
    const firstPage = page(await accounts.readKind(learner.token, 'list', { limit: '2' }))
    expect(idsOf(firstPage.changes)).toEqual([second, third])
    expect(firstPage.hasMore).toBe(true)
    const rest = page(
      await accounts.readKind(learner.token, 'list', { cursor: firstPage.cursor, limit: '2' })
    )
    expect(idsOf(rest.changes)).toEqual([first])
    expect(rest.hasMore).toBe(false)
    const synced = (await accounts.mutate(learner.token)).changes.filter(
      change => change.entity === 'list'
    )
    expect([...firstPage.changes, ...rest.changes]).toEqual(
      expect.arrayContaining(synced.map(change => expect.objectContaining(change)))
    )
    expect(rest.changes[0]).toMatchObject({ version: 2, data: { name: 'One again' } })
  })

  test("answers only what changed since its cursor, and a removed one as sync's delete", async () => {
    const learner = await accounts.learner('kind-since@example.com')
    const list = randomUUID()
    await send(
      learner,
      aList(list, 'Food', 0),
      onList(list, wordItem(1)),
      onList(list, wordItem(2))
    )
    const read = page(await accounts.readKind(learner.token, 'listWord'))
    expect(idsOf(read.changes)).toEqual([`${list}/${wordItem(1)}`, `${list}/${wordItem(2)}`])
    await send(learner, {
      entity: 'listWord',
      operation: 'remove',
      entityId: `${list}/${wordItem(1)}`,
      baseVersion: 1
    })
    const since = page(await accounts.readKind(learner.token, 'listWord', { cursor: read.cursor }))
    expect(since.changes).toEqual([deleted('listWord', `${list}/${wordItem(1)}`, 2)])
    const unchanged = page(
      await accounts.readKind(learner.token, 'listWord', { cursor: since.cursor })
    )
    expect(unchanged).toMatchObject({ changes: [], hasMore: false })
  })

  test('answers only the entities about one word or kanji: its Known mark, its place in each list, its notes, and its photos', async () => {
    const learner = await accounts.learner('kind-item@example.com')
    const [food, verbs] = [randomUUID(), randomUUID()]
    const photoId = await uploaded(accounts, learner)
    const note = aNote(wordItem(1), 'Seen in a menu.')
    const earlierNote = aNote(`wn1:${'a'.repeat(64)}`, 'From an earlier version.')
    await send(
      learner,
      aList(food, 'Food', 0),
      aList(verbs, 'Verbs', 1),
      onList(food, wordItem(1)),
      onList(food, wordItem(2)),
      onList(verbs, wordItem(1)),
      onList(verbs, 'kanji:見'),
      note,
      aNote(wordItem(2), 'Another word.'),
      earlierNote,
      {
        entity: 'knownWord',
        operation: 'mark',
        entityId: wordItem(1),
        baseVersion: 0,
        fields: text
      },
      {
        entity: 'knownWord',
        operation: 'mark',
        entityId: wordItem(2),
        baseVersion: 0,
        fields: text
      },
      photoChanges.add(photoId),
      photoChanges.onWord(photoId, 1),
      photoChanges.onWord(photoId, 2)
    )
    const about = async (entity: string, item: string) =>
      idsOf(await accounts.everyOfKind(learner.token, entity, { item }))
    expect(await about('knownWord', wordItem(1))).toEqual([wordItem(1)])
    expect(await about('listWord', wordItem(1))).toEqual([
      `${food}/${wordItem(1)}`,
      `${verbs}/${wordItem(1)}`
    ])
    expect(await about('listWord', 'kanji:見')).toEqual([`${verbs}/kanji:見`])
    expect(await about('wordNote', wordItem(1))).toEqual([note.entityId])
    expect(await about('wordNote', `wn1:${'a'.repeat(64)}`)).toEqual([earlierNote.entityId])
    expect(await about('photoWord', wordItem(1))).toEqual([`${photoId}/${wordItem(1)}`])
    expect(await about('knownWord', wordItem(3))).toEqual([])
    const notes = page(await accounts.readKind(learner.token, 'wordNote', { item: wordItem(1) }))
    await send(learner, {
      entity: 'wordNote',
      operation: 'delete',
      entityId: note.entityId,
      baseVersion: 1
    })
    const since = await accounts.readKind(learner.token, 'wordNote', {
      item: wordItem(1),
      cursor: notes.cursor
    })
    expect(page(since).changes).toEqual([deleted('wordNote', note.entityId, 2)])
    for (const query of [{}, { item: wordItem(2) }] as Record<string, string>[]) {
      const refused = await accounts.readKind(learner.token, 'wordNote', {
        ...query,
        cursor: notes.cursor
      })
      expect(refused.status, JSON.stringify(query)).toBe(410)
    }
  })

  test('refuses an item for a kind no item names, and one in no form an item takes', async () => {
    const learner = await accounts.learner('kind-bad-item@example.com')
    for (const [entity, item] of [
      ['list', wordItem(1)],
      ['knownWord', 'not-an-item'],
      ['listWord', `wn1:${'a'.repeat(64)}`],
      ['wordNote', 'kanji:mi']
    ]) {
      expect(await accounts.readKind(learner.token, entity, { item }), entity).toMatchObject({
        status: 400,
        body: { error: { code: 'bad_request' } }
      })
    }
  })

  test("refuses a kind the app's scopes don't read, naming the scope, and one the service doesn't sync", async () => {
    const tomodachi = await accounts.learner('kind-scope@example.com', 'tomodachi')
    const refused = await accounts.readKind(tomodachi.token, 'wordNote')
    expect(refused).toMatchObject({ status: 403, body: { error: { code: 'insufficient_scope' } } })
    expect(refused.headers.get('www-authenticate')).toContain('scope="notes:read"')
    expect((await accounts.readKind(tomodachi.token, 'list')).status).toBe(200)
    expect(await accounts.readKind(tomodachi.token, 'nothing')).toMatchObject({
      status: 400,
      body: { error: { code: 'bad_request' } }
    })
    for (const limit of ['0', '501', 'many']) {
      expect((await accounts.readKind(tomodachi.token, 'list', { limit })).status, limit).toBe(400)
    }
  })

  test("refuses a cursor that isn't this kind's for this account, and sync refuses one", async () => {
    const learner = await accounts.learner('kind-cursors@example.com')
    const other = await accounts.learner('kind-cursors-other@example.com')
    await send(learner, aList(randomUUID(), 'Food', 0))
    const lists = page(await accounts.readKind(learner.token, 'list')).cursor
    const syncCursor = (await accounts.mutate(learner.token)).cursor
    for (const [token, entity, cursor] of [
      [learner.token, 'list', syncCursor],
      [learner.token, 'listWord', lists],
      [other.token, 'list', lists]
    ] as const) {
      expect(await accounts.readKind(token, entity, { cursor }), entity).toMatchObject({
        status: 410,
        body: { error: { code: 'invalid_cursor' } }
      })
    }
    expect(await accounts.sync(learner.token, { cursor: lists })).toMatchObject({
      status: 410,
      body: { error: { code: 'invalid_cursor' } }
    })
  })

  test('answers 401 for a deleted account', async () => {
    const learner = await accounts.learner('kind-deleted@example.com')
    await accounts.running.service.rows(`delete from users where id = '${learner.userId}'`)
    expect((await accounts.readKind(learner.token, 'list')).status).toBe(401)
  })
})
