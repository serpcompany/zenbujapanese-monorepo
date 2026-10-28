import { dailyListId } from '@zenbu/account-rules/daily-lists'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getDictionary } from '@/lib/i18n/dictionary'
import { submit } from '@/test/account-page'
import {
  accountPagesOpen,
  dialog,
  forgetAll,
  labels,
  loaded,
  named,
  page,
  press,
  renderPrompt,
  signedInHere,
  standingIn,
  syncedText,
  typeInto,
  word
} from '@/test/learner-actions'
import type { SyncedStandIn } from '@/test/synced-stand-in'

vi.hoisted(() => vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'open'))
afterEach(forgetAll)

const food = '1a2b3c4d-0000-4000-8000-000000000001'
const verbs = '1a2b3c4d-0000-4000-8000-000000000002'

const list = (id: string, name: string, position: number) => ({
  id,
  name,
  position,
  createdAt: '2026-10-01T00:00:00.000Z'
})

function withTwoLists(standIn: SyncedStandIn) {
  return standIn
    .holds('list', food, list(food, 'Food', 1))
    .holds('list', verbs, list(verbs, 'Verbs', 0))
    .holds('listWord', `${verbs}/${word.id}`, { listId: verbs, itemId: word.id, ...labels })
}

const checkbox = (name: string) => named('checkbox', name)

const shownLists = () =>
  [...dialog().querySelectorAll('[role="checkbox"]')].map(box => [
    document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent,
    box.getAttribute('aria-checked')
  ])

async function openAddToList(standIn: SyncedStandIn) {
  renderPrompt('lists')
  await press('button', 'Add to List')
  await loaded('Food')
  return standIn
}

describe('signed in with a subscription, Add to List', () => {
  beforeEach(() => {
    accountPagesOpen()
    signedInHere()
  })

  test("shows every list in the app's order, checked where the word is, each opening its list", async () => {
    const standIn = await openAddToList(withTwoLists(standingIn()))
    expect(standIn.reads).toEqual(['list?limit=500', `listWord?limit=500&item=${word.id}`])
    expect(checkbox('Verbs').getAttribute('aria-checked')).toBe('true')
    expect(checkbox('Food').getAttribute('aria-checked')).toBe('false')
    expect(dialog().textContent?.indexOf('Verbs')).toBeLessThan(
      dialog().textContent?.indexOf('Food') ?? 0
    )
    expect(named('a', 'Open Food').getAttribute('href')).toBe(`/account/lists/?list=${food}`)
  })

  test('toggling a list adds the word to it, or removes it, at once', async () => {
    const standIn = await openAddToList(withTwoLists(standingIn()))
    await press('checkbox', 'Food')
    await vi.waitFor(() => expect(checkbox('Food').getAttribute('aria-checked')).toBe('true'))
    expect(standIn.dataOf('listWord', `${food}/${word.id}`)).toMatchObject({
      listId: food,
      itemId: word.id,
      headword: word.headword,
      reading: word.reading
    })
    await press('checkbox', 'Verbs')
    await vi.waitFor(() => expect(checkbox('Verbs').getAttribute('aria-checked')).toBe('false'))
    expect(standIn.dataOf('listWord', `${verbs}/${word.id}`)).toBeNull()
    expect(standIn.sent.map(each => [each.operation, each.entityId])).toEqual([
      ['add', `${food}/${word.id}`],
      ['remove', `${verbs}/${word.id}`]
    ])
  })

  test('New List asks for a name, makes the list after the others, and puts the word in it', async () => {
    const standIn = await openAddToList(withTwoLists(standingIn()))
    await press('button', syncedText.lists.newList)
    await submit(page(), syncedText.lists.create)
    await loaded(syncedText.lists.nameRule)
    expect(standIn.sent).toEqual([])
    await typeInto(named<HTMLInputElement>('input', syncedText.lists.name), '  Travel ')
    await submit(page(), syncedText.lists.create)
    await vi.waitFor(() => expect(checkbox('Travel').getAttribute('aria-checked')).toBe('true'))
    const [created, added] = standIn.sent
    expect(created).toMatchObject({
      entity: 'list',
      operation: 'create',
      fields: { name: 'Travel', position: 2 }
    })
    expect(added).toMatchObject({
      entity: 'listWord',
      operation: 'add',
      entityId: `${created?.entityId}/${word.id}`
    })
    expect(shownLists()).toEqual([
      ['Verbs', 'true'],
      ['Food', 'false'],
      ['Travel', 'true']
    ])
    expect(dialog().textContent).not.toContain(syncedText.lists.nameRule)
  })

  test('leaves daily lists out, and puts a new list after the own lists', async () => {
    const daily = dailyListId('2026-10-28') ?? ''
    const standIn = await openAddToList(
      withTwoLists(standingIn())
        .holds('list', daily, list(daily, '2026-10-28', 5))
        .holds('listWord', `${daily}/${word.id}`, { listId: daily, itemId: word.id, ...labels })
    )
    expect(shownLists()).toEqual([
      ['Verbs', 'true'],
      ['Food', 'false']
    ])
    await press('button', syncedText.lists.newList)
    await typeInto(named<HTMLInputElement>('input', syncedText.lists.name), 'Travel')
    await submit(page(), syncedText.lists.create)
    await vi.waitFor(() => expect(checkbox('Travel').getAttribute('aria-checked')).toBe('true'))
    expect(standIn.sent[0]).toMatchObject({ entity: 'list', fields: { position: 2 } })
    expect(shownLists().map(([name]) => name)).toEqual(['Verbs', 'Food', 'Travel'])
  })

  test('a refused change says why, and leaves the list as it was', async () => {
    const standIn = await openAddToList(withTwoLists(standingIn()))
    standIn.refuseNext('unknown_list')
    await press('checkbox', 'Food')
    await loaded(syncedText.refusals.unknownList)
    expect(checkbox('Food').getAttribute('aria-checked')).toBe('false')
    expect(standIn.dataOf('listWord', `${food}/${word.id}`)).toBeNull()
  })

  test('with no lists, says so, and a list made whose word then fails to go in keeps its name to try again, which puts the word in that list', async () => {
    const standIn = standingIn()
    const service = globalThis.fetch
    let changes = 0
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      if (init.method === 'POST' && ++changes === 2) throw new TypeError('offline')
      return service(url, init)
    })
    renderPrompt('lists')
    await press('button', 'Add to List')
    await loaded(syncedText.lists.none)
    await press('button', syncedText.lists.newList)
    await typeInto(named<HTMLInputElement>('input', syncedText.lists.name), 'Travel')
    await submit(page(), syncedText.lists.create)
    await loaded(getDictionary('en').account.messages.offline)
    expect(shownLists()).toEqual([['Travel', 'false']])
    expect(named<HTMLInputElement>('input', syncedText.lists.name).value).toBe('Travel')
    expect(standIn.sent.map(each => each.operation)).toEqual(['create'])
    await submit(page(), syncedText.lists.create)
    await vi.waitFor(() => expect(checkbox('Travel').getAttribute('aria-checked')).toBe('true'))
    expect(shownLists()).toEqual([['Travel', 'true']])
    expect(named('button', syncedText.lists.newList)).toBeTruthy()
    const [created, ...rest] = standIn.sent
    expect(rest.map(each => [each.operation, each.entityId])).toEqual([
      ['create', created?.entityId],
      ['add', `${created?.entityId}/${word.id}`]
    ])
    expect(standIn.dataOf('list', created?.entityId ?? '')).toMatchObject({ name: 'Travel' })
  })
})
