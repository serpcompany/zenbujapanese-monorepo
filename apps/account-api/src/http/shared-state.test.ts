import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const word = (n: number) => n.toString(16).padStart(32, '0')
const text = { headword: '見る', reading: 'みる' }

type Result = { id: string; status: string; version?: number; current?: Record<string, unknown> }

async function send(learner: Learner, ...mutations: Record<string, unknown>[]) {
  const answer = await accounts.sync(learner.token, {
    mutations: mutations.map(mutation => ({ id: randomUUID(), ...mutation }))
  })
  expect(answer.status, JSON.stringify(answer.body)).toBe(200)
  return (answer.body as unknown as { results: Result[] }).results
}

const mark = (itemId: string, baseVersion: number) => ({
  entity: 'knownWord',
  operation: 'mark',
  entityId: itemId,
  baseVersion,
  fields: text
})
const clear = (itemId: string, baseVersion: number) => ({
  entity: 'knownWord',
  operation: 'clear',
  entityId: itemId,
  baseVersion
})

describe('known words', () => {
  test('mark a word from version 0; marking it again changes nothing', async () => {
    const learner = await accounts.learner('known-mark@example.com')
    expect(await send(learner, mark(word(1), 0))).toMatchObject([{ status: 'applied', version: 1 }])
    expect(await send(learner, mark(word(1), 0))).toMatchObject([{ status: 'applied', version: 1 }])
    expect(await send(learner, mark('kanji:日', 0))).toMatchObject([
      { status: 'applied', version: 1 }
    ])
    const answer = await accounts.sync(learner.token, {})
    expect((answer.body as unknown as { changes: unknown[] }).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: 'knownWord',
          entityId: word(1),
          version: 1,
          data: { itemId: word(1), ...text, known: true }
        })
      ])
    )
  })

  test("a mark made before the learner's clear loses to it, and one made after it wins", async () => {
    const learner = await accounts.learner('known-rule@example.com')
    await send(learner, mark(word(2), 0))
    expect(await send(learner, clear(word(2), 1))).toMatchObject([
      { status: 'applied', version: 2 }
    ])
    expect(await send(learner, mark(word(2), 1))).toMatchObject([
      {
        status: 'conflict',
        version: 2,
        current: { entity: 'knownWord', data: expect.objectContaining({ known: false }) }
      }
    ])
    expect(await send(learner, mark(word(2), 2))).toMatchObject([{ status: 'applied', version: 3 }])
  })

  test('a clear that never saw a later mark conflicts, and clearing a word not known changes nothing', async () => {
    const learner = await accounts.learner('known-clear@example.com')
    await send(learner, mark(word(3), 0))
    await send(learner, clear(word(3), 1))
    await send(learner, mark(word(3), 2))
    expect(await send(learner, clear(word(3), 1))).toMatchObject([
      {
        status: 'conflict',
        version: 3,
        current: { data: expect.objectContaining({ known: true }) }
      }
    ])
    expect(await send(learner, clear(word(4), 0))).toMatchObject([
      { status: 'applied', version: 0 }
    ])
  })

  test('refuses an item that is neither a Language Reference ID nor a kanji, and a mark with no headword', async () => {
    const learner = await accounts.learner('known-bad@example.com')
    const results = await send(
      learner,
      mark('ABC', 0),
      mark('kanji:a', 0),
      mark('kanji:日本', 0),
      { ...mark(word(5), 0), fields: { reading: 'x' } },
      { ...mark(word(5), 0), baseVersion: undefined }
    )
    expect(results.map(result => (result as { error?: { code: string } }).error?.code)).toEqual([
      'invalid_mutation',
      'invalid_mutation',
      'invalid_mutation',
      'invalid_fields',
      'invalid_mutation'
    ])
  })
})

const list = (id: string, operation: string, baseVersion: number, fields?: object) => ({
  entity: 'list',
  operation,
  entityId: id,
  baseVersion,
  ...(fields ? { fields } : {})
})
const listWord = (listId: string, itemId: string, operation: string, baseVersion = 0) => ({
  entity: 'listWord',
  operation,
  entityId: `${listId}/${itemId}`,
  baseVersion,
  ...(operation === 'add' ? { fields: text } : {})
})

describe('lists', () => {
  test('create, rename, move, and delete a list, each at its version; deleting takes its words', async () => {
    const learner = await accounts.learner('lists@example.com')
    const id = randomUUID()
    expect(
      await send(
        learner,
        list(id, 'create', 0, { name: ' Verbs ', position: 0 }),
        list(id, 'update', 1, { name: 'Verbs to learn' }),
        list(id, 'update', 2, { position: 3 }),
        listWord(id, word(6), 'add')
      )
    ).toMatchObject([
      { status: 'applied', version: 1 },
      { status: 'applied', version: 2 },
      { status: 'applied', version: 3 },
      { status: 'applied', version: 1 }
    ])
    const before = await accounts.sync(learner.token, {})
    expect((before.body as unknown as { changes: unknown[] }).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: 'list',
          entityId: id,
          version: 3,
          data: expect.objectContaining({ name: 'Verbs to learn', position: 3 })
        })
      ])
    )
    expect(await send(learner, list(id, 'delete', 3))).toMatchObject([
      { status: 'applied', version: 4 }
    ])
    expect(await send(learner, listWord(id, word(7), 'add'))).toMatchObject([
      { status: 'rejected', error: { code: 'unknown_list' } }
    ])
    const after = await accounts.sync(learner.token, {})
    const changes = (after.body as unknown as { changes: { entity: string; entityId: string }[] })
      .changes
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'list', entityId: id, operation: 'delete', data: null })
      ])
    )
    expect(changes.filter(change => change.entity === 'listWord')).toEqual([])
  })

  test('two renames from one version conflict: the second gets the name as it is now', async () => {
    const learner = await accounts.learner('rename@example.com')
    const id = randomUUID()
    await send(learner, list(id, 'create', 0, { name: 'Food', position: 0 }))
    expect(await send(learner, list(id, 'update', 1, { name: 'Food (Mac)' }))).toMatchObject([
      { status: 'applied', version: 2 }
    ])
    expect(await send(learner, list(id, 'update', 1, { name: 'Food (phone)' }))).toMatchObject([
      {
        status: 'conflict',
        version: 2,
        current: { entity: 'list', data: expect.objectContaining({ name: 'Food (Mac)' }) }
      }
    ])
  })

  test('refuse a second list with one ID, a bad ID, a list with no name, and a position out of range', async () => {
    const learner = await accounts.learner('list-bad@example.com')
    const id = randomUUID()
    await send(learner, list(id, 'create', 0, { name: 'One', position: 0 }))
    const results = await send(
      learner,
      list(id, 'create', 0, { name: 'Again', position: 1 }),
      list('not-a-uuid', 'create', 0, { name: 'Bad', position: 1 }),
      list(randomUUID(), 'create', 0, { name: '  ', position: 1 }),
      list(randomUUID(), 'create', 0, { name: 'Far', position: -1 }),
      list(id, 'update', 1, {})
    )
    expect(results.map(result => (result as { error?: { code: string } }).error?.code)).toEqual([
      'already_exists',
      'invalid_mutation',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields'
    ])
  })

  test('hold at most 500 lists to an account, and 5,000 words to a list', async () => {
    const learner = await accounts.learner('list-limits@example.com')
    const id = randomUUID()
    await send(learner, list(id, 'create', 0, { name: 'Big', position: 0 }))
    await accounts.running.service.rows(
      `insert into list_words (user_id, list_id, item_id, headword, reading, present, version) select '${learner.userId}', '${id}', lpad(to_hex(n), 32, '0'), 'w', '', true, 1 from generate_series(1, 5000) as n`
    )
    expect(await send(learner, listWord(id, word(9_999), 'add'))).toMatchObject([
      { status: 'rejected', error: { code: 'list_full' } }
    ])
    await accounts.running.service.rows(
      `insert into word_lists (user_id, id, name, position, version) select '${learner.userId}', gen_random_uuid()::text, 'L', n, 1 from generate_series(1, 499) as n`
    )
    expect(
      await send(learner, list(randomUUID(), 'create', 0, { name: 'One more', position: 0 }))
    ).toMatchObject([{ status: 'rejected', error: { code: 'too_many_lists' } }])
  })
})

describe('list words', () => {
  test('an add always applies, and a remove applies only if it saw the latest add', async () => {
    const learner = await accounts.learner('list-words@example.com')
    const id = randomUUID()
    await send(learner, list(id, 'create', 0, { name: 'Mixed', position: 0 }))
    await send(learner, listWord(id, word(8), 'add'))
    await send(learner, listWord(id, word(8), 'remove', 1))
    await send(learner, listWord(id, word(8), 'add'))
    expect(await send(learner, listWord(id, word(8), 'remove', 1))).toMatchObject([
      { status: 'conflict', version: 3, current: { entity: 'listWord', operation: 'put' } }
    ])
    expect(await send(learner, listWord(id, word(8), 'remove', 3))).toMatchObject([
      { status: 'applied', version: 4 }
    ])
    expect(await send(learner, listWord(id, word(8), 'remove', 0))).toMatchObject([
      { status: 'applied', version: 4 }
    ])
  })
})

test('retries of a mark, a create, and an add each apply once', async () => {
  const learner = await accounts.learner('shared-retry@example.com')
  const id = randomUUID()
  const batch = {
    mutations: [
      { id: 'retry-mark-01', ...mark(word(10), 0) },
      { id: 'retry-list-01', ...list(id, 'create', 0, { name: 'Retry', position: 0 }) },
      { id: 'retry-word-01', ...listWord(id, word(10), 'add') }
    ]
  }
  const first = await accounts.sync(learner.token, batch)
  const again = await accounts.sync(learner.token, batch)
  expect((again.body as unknown as { results: unknown }).results).toEqual(
    (first.body as unknown as { results: unknown }).results
  )
  expect(
    (first.body as unknown as { results: Result[] }).results.map(result => result.status)
  ).toEqual(['applied', 'applied', 'applied'])
})

test('two clients converge on the same known words and lists after offline edits on both', async () => {
  const learner = await accounts.learner('converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const mac = new SyncClient(accounts, learner.token)
  const shared = randomUUID()
  phone.change('list', 'create', shared, { name: 'Shared', position: 0 })
  phone.change('knownWord', 'mark', word(20), text)
  await phone.sync()
  await mac.sync()

  phone.change('knownWord', 'clear', word(20))
  phone.change('list', 'update', shared, { name: 'Shared (phone)' })
  phone.change('listWord', 'add', `${shared}/${word(21)}`, text)
  const phoneOnly = randomUUID()
  phone.change('list', 'create', phoneOnly, { name: 'Phone', position: 1 })
  mac.change('knownWord', 'mark', word(22), text)
  mac.change('list', 'update', shared, { name: 'Shared (Mac)' })
  mac.change('listWord', 'add', `${shared}/${word(23)}`, text)

  await mac.sync()
  await phone.sync()
  await mac.sync()

  expect(phone.state()).toEqual(mac.state())
  expect(phone.dataOf('list', shared)).toMatchObject({ name: 'Shared (Mac)' })
  expect(phone.dataOf('knownWord', word(20))).toMatchObject({ known: false })
  expect(mac.dataOf('knownWord', word(22))).toMatchObject({ known: true })
  expect(mac.dataOf('list', phoneOnly)).toMatchObject({ name: 'Phone' })
  for (const item of [word(21), word(23)]) {
    expect(mac.dataOf('listWord', `${shared}/${item}`)).toMatchObject({ itemId: item })
  }
  const fresh = new SyncClient(accounts, learner.token)
  await fresh.sync()
  expect(fresh.state()).toEqual(phone.state())
})

describe('lists the iOS app makes', () => {
  test('take its uppercase UUIDs, and any name it allows, trimmed', async () => {
    const learner = await accounts.learner('ios-lists@example.com')
    const id = randomUUID().toUpperCase()
    const names = ['🧑‍💻 Code', 'x'.repeat(300), 'Tab\there']
    const results = await send(
      learner,
      ...names.map((name, position) =>
        list(position === 0 ? id : randomUUID().toUpperCase(), 'create', 0, { name, position })
      ),
      listWord(id, word(30), 'add')
    )
    expect(results.map(result => result.status)).toEqual([
      'applied',
      'applied',
      'applied',
      'applied'
    ])
    const listed = await accounts.running.service.rows(
      `select id, name from word_lists where user_id = '${learner.userId}' order by position`
    )
    expect(listed).toEqual([
      { id: id.toLowerCase(), name: '🧑‍💻 Code' },
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: 'x'.repeat(300) },
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: 'Tab here' }
    ])
  })

  test('refuse fields a list has not, and take a resent update that already matches', async () => {
    const learner = await accounts.learner('list-fields@example.com')
    const id = randomUUID()
    await send(learner, list(id, 'create', 0, { name: 'Same', position: 0 }))
    await send(learner, list(id, 'update', 1, { name: 'Renamed' }))
    expect(await send(learner, list(id, 'update', 2, { bogus: 1 }))).toMatchObject([
      { status: 'rejected', error: { code: 'invalid_fields' } }
    ])
    expect(await send(learner, list(id, 'update', 1, { name: 'Renamed' }))).toMatchObject([
      { status: 'applied', version: 2 }
    ])
  })
})

test('deleting a list wins over what was done to it since, words added elsewhere too', async () => {
  const learner = await accounts.learner('delete-wins@example.com')
  const id = randomUUID()
  await send(learner, list(id, 'create', 0, { name: 'Gone soon', position: 0 }))
  await send(
    learner,
    list(id, 'update', 1, { name: 'Renamed on the Mac' }),
    listWord(id, word(31), 'add')
  )
  expect(await send(learner, list(id, 'delete', 1))).toMatchObject([
    { status: 'applied', version: 3 }
  ])
  expect(await send(learner, list(id, 'update', 1, { name: 'Too late' }))).toMatchObject([
    { status: 'conflict', current: { entity: 'list', operation: 'delete', data: null } }
  ])
  expect(await send(learner, list(id, 'delete', 0))).toMatchObject([
    { status: 'applied', version: 3 }
  ])
  const words = await accounts.running.service.rows(
    `select count(*)::int as n from list_words where user_id = '${learner.userId}'`
  )
  expect(words).toEqual([{ n: 0 }])
})

test('a kanji written as a compatibility character is the same item', async () => {
  const learner = await accounts.learner('kanji-forms@example.com')
  await send(learner, mark('kanji:\u{FA10}', 0))
  expect(await send(learner, mark('kanji:\u{585A}', 0))).toMatchObject([
    { status: 'applied', version: 1 }
  ])
  const rows = await accounts.running.service.rows(
    `select item_id from known_words where user_id = '${learner.userId}'`
  )
  expect(rows).toEqual([{ item_id: 'kanji:\u{585A}' }])
})

test('answers a list before its words on a page, even when the list changed last', async () => {
  const learner = await accounts.learner('list-order@example.com')
  const id = randomUUID()
  await send(
    learner,
    list(id, 'create', 0, { name: 'Order', position: 0 }),
    listWord(id, word(32), 'add')
  )
  await send(learner, list(id, 'update', 1, { name: 'Order, renamed' }))
  const answer = await accounts.sync(learner.token, {})
  const entities = (answer.body as unknown as { changes: { entity: string }[] }).changes.map(
    change => change.entity
  )
  expect(entities.indexOf('list')).toBeLessThan(entities.indexOf('listWord'))
})

test('a conflict or a rejection sent again under its ID answers the same, for each entity', async () => {
  const learner = await accounts.learner('replay-entities@example.com')
  const id = randomUUID()
  await send(learner, mark(word(33), 0), list(id, 'create', 0, { name: 'Replay', position: 0 }))
  await send(learner, clear(word(33), 1), list(id, 'update', 1, { name: 'Renamed' }))
  const batch = {
    mutations: [
      { id: 'replay-mark-01', ...mark(word(33), 1) },
      { id: 'replay-list-01', ...list(id, 'update', 1, { name: 'Stale' }) },
      { id: 'replay-bad-001', ...list(randomUUID(), 'create', 0, { name: '', position: 0 }) }
    ]
  }
  const first = (await accounts.sync(learner.token, batch)).body as unknown as { results: Result[] }
  const again = (await accounts.sync(learner.token, batch)).body as unknown as { results: Result[] }
  const outcome = ({
    id,
    status,
    version,
    current,
    error
  }: Result & { error?: { code: string } }) => ({
    id,
    status,
    version,
    current,
    code: error?.code
  })
  expect(first.results.map(result => result.status)).toEqual(['conflict', 'conflict', 'rejected'])
  expect(again.results.map(outcome)).toEqual(first.results.map(outcome))
})

test('two clients converge through list deletes, word removes, and adds neither saw', async () => {
  const learner = await accounts.learner('converge-deletes@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const mac = new SyncClient(accounts, learner.token)
  const doomed = randomUUID()
  const kept = randomUUID()
  phone.change('list', 'create', doomed, { name: 'Doomed', position: 0 })
  phone.change('list', 'create', kept, { name: 'Kept', position: 1 })
  phone.change('listWord', 'add', `${kept}/${word(40)}`, text)
  await phone.sync()
  await mac.sync()

  phone.change('list', 'delete', doomed)
  phone.change('listWord', 'remove', `${kept}/${word(40)}`)
  mac.change('list', 'update', doomed, { name: 'Doomed, renamed' })
  mac.change('listWord', 'add', `${doomed}/${word(41)}`, text)
  mac.change('listWord', 'add', `${kept}/${word(42)}`, text)

  await phone.sync()
  await mac.sync()
  await phone.sync()

  expect(mac.state()).toEqual(phone.state())
  expect(phone.dataOf('list', doomed)).toBeNull()
  expect(phone.dataOf('listWord', `${kept}/${word(40)}`)).toBeNull()
  expect(phone.dataOf('listWord', `${kept}/${word(42)}`)).toMatchObject({ itemId: word(42) })
  const fresh = new SyncClient(accounts, learner.token)
  await fresh.sync()
  expect(fresh.state()).toEqual(phone.state())
})
