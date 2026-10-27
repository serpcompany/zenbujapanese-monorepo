import { randomUUID } from 'node:crypto'
import {
  AccountCopy,
  type AccountTransport,
  type KindPage,
  type MutationResult
} from '@zenbu/account-rules/account-copy'
import { listsInOrder, nextListPosition, wordsOfList } from '@zenbu/account-rules/account-views'
import { describe, expect, test } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import { searchIdFor } from '../test/kept'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const word = (n: number) => n.toString(16).padStart(32, '0')
const text = { headword: '見る', reading: 'みる' }
const shownKinds = ['list', 'listWord', 'knownWord', 'wordNote', 'recentSearch', 'setting']

function websiteTransport(learner: Learner): AccountTransport<number> {
  return {
    async readKind(entity, query) {
      const asText = Object.fromEntries(
        Object.entries(query).map(([key, value]) => [key, `${value}`])
      )
      const answer = await accounts.readKind(learner.token, entity, asText)
      return answer.status === 200
        ? { ok: true, value: answer.body as unknown as KindPage }
        : { ok: false, failure: answer.status }
    },
    async sync(mutations) {
      const answer = await accounts.sync(learner.token, { mutations, limit: 1 })
      return answer.status === 200
        ? { ok: true, value: (answer.body as unknown as { results: MutationResult[] }).results }
        : { ok: false, failure: answer.status }
    },
    isStaleCursor: status => status === 410
  }
}

async function onBoth(email: string) {
  const app = await accounts.learner(email)
  const web = await accounts.learner(email, 'zenbu-web')
  const phone = new SyncClient(accounts, app.token)
  const website = new AccountCopy(websiteTransport(web), randomUUID)
  const readAll = async () => {
    for (const kind of shownKinds)
      expect(await website.read(kind), kind).toMatchObject({ ok: true })
  }
  return { app, phone, website, readAll }
}

function websiteState(website: AccountCopy<number>) {
  return new Map(
    shownKinds.flatMap(kind =>
      website
        .held(kind)
        .filter(held => held.data !== null)
        .map(held => [`${kind}:${held.entityId}`, held.data] as const)
    )
  )
}

function phoneState(phone: SyncClient) {
  return new Map(
    [...phone.state()]
      .filter(([key]) => shownKinds.includes(key.slice(0, key.indexOf(':'))))
      .map(([key, held]) => [key, held.data] as const)
  )
}

describe('the website, editing what an app syncs', () => {
  test('a list, its words, Known marks, a note, a search, and a setting changed on the website reach the app, and the app’s reach the website', async () => {
    const { app, phone, website, readAll } = await onBoth('website-converges@example.com')
    const food = randomUUID()
    const note = randomUUID()
    const searchId = searchIdFor(app, '見る')
    phone.change('list', 'create', food, { name: 'Food', position: 0 })
    phone.change('listWord', 'add', `${food}/${word(1)}`, text)
    phone.change('listWord', 'add', `${food}/${word(2)}`, text)
    phone.change('knownWord', 'mark', word(1), text)
    phone.change('wordNote', 'write', note, { item: word(1), text: 'From the app.' })
    phone.change('recentSearch', 'search', searchId, {
      query: '見る',
      searchedAt: '2026-10-01T12:00:00Z'
    })
    await phone.sync()

    await readAll()
    expect(listsInOrder(website.held('list')).map(list => list.data.name)).toEqual(['Food'])
    expect(wordsOfList(website.held('listWord'), food)).toHaveLength(2)
    expect(websiteState(website)).toEqual(phoneState(phone))

    const verbs = randomUUID()
    const changes: [string, string, string, Record<string, unknown>?][] = [
      ['list', 'update', food, { name: 'Food and drink' }],
      ['listWord', 'remove', `${food}/${word(1)}`],
      ['listWord', 'add', `${food}/${word(3)}`, text],
      [
        'list',
        'create',
        verbs,
        { name: 'Verbs', position: nextListPosition(website.held('list')) }
      ],
      ['listWord', 'add', `${verbs}/kanji:見`, { headword: '見' }],
      ['knownWord', 'clear', word(1)],
      ['knownWord', 'mark', word(2), text],
      ['wordNote', 'write', note, { item: word(1), text: 'Changed on the website.' }],
      ['recentSearch', 'remove', searchId],
      ['setting', 'set', 'frequencyDictionaries.chosen', { value: 'zenbu.jlpt' }]
    ]
    for (const [entity, operation, entityId, fields] of changes) {
      expect(await website.change(entity, operation, entityId, fields), operation).toEqual({
        status: 'applied'
      })
    }
    await phone.sync()
    expect(phoneState(phone)).toEqual(websiteState(website))
    expect(phone.dataOf('wordNote', note)).toMatchObject({ text: 'Changed on the website.' })
    expect(phone.dataOf('recentSearch', searchId)).toBeNull()

    phone.change('listWord', 'remove', `${food}/${word(2)}`)
    phone.change('list', 'delete', verbs)
    await phone.sync()
    await readAll()
    expect(websiteState(website)).toEqual(phoneState(phone))
    expect([...websiteState(website).keys()].filter(key => key.includes(verbs))).toEqual([])
  })

  test('a note changed in the app while the website changes it keeps both texts, on both', async () => {
    const { phone, website, readAll } = await onBoth('website-note-race@example.com')
    const note = randomUUID()
    phone.change('wordNote', 'write', note, { item: word(1), text: 'First.' })
    await phone.sync()
    await readAll()
    phone.change('wordNote', 'write', note, { item: word(1), text: 'The app’s.' })
    await phone.sync()
    const kept = await website.change('wordNote', 'write', note, {
      item: word(1),
      text: 'The website’s.'
    })
    expect(kept).toMatchObject({ status: 'kept-as-new' })
    await phone.sync()
    const texts = (state: Map<string, unknown>) =>
      [...state]
        .filter(([key]) => key.startsWith('wordNote:'))
        .map(([, data]) => (data as { text: string }).text)
        .sort()
    expect(texts(phoneState(phone))).toEqual(['The app’s.', 'The website’s.'])
    expect(phoneState(phone)).toEqual(websiteState(website))
  })

  test('a word added on the website to a list the app deleted is refused, and the website drops the list and its words', async () => {
    const { phone, website, readAll } = await onBoth('website-list-gone@example.com')
    const food = randomUUID()
    phone.change('list', 'create', food, { name: 'Food', position: 0 })
    phone.change('listWord', 'add', `${food}/${word(1)}`, text)
    await phone.sync()
    await readAll()
    phone.change('list', 'delete', food)
    await phone.sync()
    expect(await website.change('listWord', 'add', `${food}/${word(2)}`, text)).toMatchObject({
      status: 'rejected',
      code: 'unknown_list'
    })
    expect(listsInOrder(website.held('list'))).toEqual([])
    expect(website.held('listWord').filter(held => held.data !== null)).toEqual([])
    expect(websiteState(website)).toEqual(phoneState(phone))
  })

  test('a Known mark the website clears after the app marked it again conflicts, and the website shows it Known', async () => {
    const { phone, website, readAll } = await onBoth('website-known-race@example.com')
    phone.change('knownWord', 'mark', word(1), text)
    await phone.sync()
    await readAll()
    phone.change('knownWord', 'clear', word(1))
    await phone.sync()
    phone.change('knownWord', 'mark', word(1), text)
    await phone.sync()
    expect(await website.change('knownWord', 'clear', word(1))).toEqual({ status: 'conflict' })
    expect(website.heldOne('knownWord', word(1))).toMatchObject({
      version: 3,
      data: { known: true }
    })
    expect(websiteState(website)).toEqual(phoneState(phone))
  })
})
