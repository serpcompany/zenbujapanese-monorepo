import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  answer,
  click,
  fill,
  refusal,
  shows,
  stubAccountService,
  unmount
} from '@/test/account-page'
import { renderAccountView } from '@/test/account-view'
import {
  food,
  list,
  miru,
  onList,
  openArea,
  renderArea,
  subscriptionAnswering,
  taberu,
  verbs,
  word
} from '@/test/synced-page'
import { SyncedStandIn } from '@/test/synced-stand-in'

afterEach(unmount)

const linkTexts = (page: HTMLElement, within: string) =>
  [...page.querySelectorAll(`${within} a`)].map(link => link.textContent)

describe("an account's data pages, reading the account from the browser", () => {
  test('say signed out when the browser has no session, and read nothing', async () => {
    const service = stubAccountService({ 'GET /v1/auth/get-session': answer(null) })
    const page = renderArea('knownWords')
    await shows(page, 'You’re not signed in.')
    expect(service.routes()).toEqual(['GET /v1/auth/get-session'])
  })

  test('point an account without a subscription to the subscription, changing nothing', async () => {
    const standIn = new SyncedStandIn()
    standIn.subscribed = false
    const { page } = openArea('lists', standIn)
    await shows(page, 'needs a subscription')
    const link = [...page.querySelectorAll('a')].find(a => a.textContent === 'See the subscription')
    expect(link?.getAttribute('href')).toBe('/account/#subscription')
    expect(standIn.sent).toEqual([])
  })

  test('say the service could not answer, and read again when asked', async () => {
    const { page, service } = openArea('knownWords', new SyncedStandIn(), {
      more: { 'GET /v1/auth/get-session': refusal(503, 'unavailable') }
    })
    await shows(page, 'Try again')
    await click(page, 'Try again')
    await shows(page, 'Try again')
    expect(service.routes().filter(route => route === 'GET /v1/auth/get-session')).toHaveLength(2)
  })
})

const knowsMiru = () =>
  new SyncedStandIn().holds('knownWord', word(1), { itemId: word(1), ...miru, known: true })

describe('Known Words', () => {
  test('lists every word and kanji marked known, most recently marked first, not one set Learning, and marks one unknown', async () => {
    const standIn = new SyncedStandIn()
      .holds('knownWord', word(1), { itemId: word(1), ...miru, known: true })
      .holds('knownWord', word(3), { itemId: word(3), ...taberu, known: false }, 2)
      .holds('knownWord', word(4), { itemId: word(4), ...taberu, state: 'learning', known: false })
      .holds('knownWord', 'kanji:日', { itemId: 'kanji:日', headword: '日', known: true })
      .hasPage(word(1), '/dictionary/見る-1259290/')
      .hasPage('kanji:日', '/dictionary/search/%E6%97%A5/')
    const { page } = openArea('knownWords', standIn)
    await shows(page, '2 words and kanji')
    const links = [...page.querySelectorAll('section a')].map(a => a.getAttribute('href'))
    expect(linkTexts(page, 'section')).toEqual(['日', '見る（みる）'])
    expect(links).toEqual(['/dictionary/search/%E6%97%A5/', '/dictionary/見る-1259290/'])
    await fill(page, 'Search your known words', 'みる')
    expect(linkTexts(page, 'section')).toEqual(['見る（みる）'])
    await click(page, 'Mark 見る（みる） as Unknown')
    await shows(page, '1 word or kanji')
    expect(standIn.sent).toMatchObject([
      { entity: 'knownWord', operation: 'clear', entityId: word(1), baseVersion: 1 }
    ])
    expect(standIn.dataOf('knownWord', word(1))).toMatchObject({ known: false })
  })

  test("draws no word until the dictionary has said where each word's page is", async () => {
    const { promise: answered, resolve: answer } = Promise.withResolvers<void>()
    const standIn = knowsMiru().hasPage(word(1), '/dictionary/見る-1259290/')
    const { page } = openArea('knownWords', standIn)
    const reachesTheService = globalThis.fetch
    let asked = false
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.startsWith('/dictionary/pages.json')) {
        asked = true
        await answered
      }
      return reachesTheService(url, init)
    })
    await vi.waitFor(() => expect(asked).toBe(true))
    await shows(page, 'Loading')
    expect(page.textContent).not.toContain('見る')
    answer()
    await shows(page, '見る（みる）')
    expect(page.querySelector('section a')?.getAttribute('href')).toBe('/dictionary/見る-1259290/')
  })

  test("links a word to its search while the dictionary can't say where its page is", async () => {
    const standIn = knowsMiru()
    const { page } = openArea('knownWords', standIn)
    await shows(page, '見る（みる）')
    expect(page.querySelector('section a')?.getAttribute('href')).toBe(
      '/dictionary/search/%E8%A6%8B%E3%82%8B/'
    )
  })

  test('says a change went through but the page could not read the account again, and never sends it twice', async () => {
    const standIn = knowsMiru()
    const { page } = openArea('knownWords', standIn)
    await shows(page, '1 word or kanji')
    standIn.failNextRead(429)
    await click(page, 'Mark 見る（みる） as Unknown')
    await shows(page, 'Too many tries')
    expect(standIn.sent).toHaveLength(1)
    expect(standIn.dataOf('knownWord', word(1))).toMatchObject({ known: false })
  })
})

describe('Lists', () => {
  const twoLists = () =>
    new SyncedStandIn()
      .holds('list', verbs, list(verbs, 'Verbs', 1))
      .holds('list', food, list(food, 'Food', 0))
      .holds('listWord', `${food}/${word(1)}`, onList(food, word(1), miru, '2026-10-01T00:00:00Z'))
      .holds(
        'listWord',
        `${food}/${word(2)}`,
        onList(food, word(2), taberu, '2026-10-02T00:00:00Z')
      )
      .holds('knownWord', word(2), { itemId: word(2), ...taberu, known: true })

  const listNames = (page: HTMLElement) => linkTexts(page, '[data-slot="item-title"]')

  test('shows every list in its order with its word count, makes one after the last, and moves one', async () => {
    const { page, standIn } = openArea('lists', twoLists())
    await shows(page, '2 words')
    expect(listNames(page)).toEqual(['Food', 'Verbs'])
    await fill(page, 'New List', '  Anime  ')
    await click(page, 'Create List')
    await shows(page, 'Anime')
    expect(standIn.sent.at(-1)).toMatchObject({
      entity: 'list',
      operation: 'create',
      fields: { name: 'Anime', position: 2 }
    })
    await click(page, 'Move Anime up')
    await shows(page, 'Anime')
    expect(listNames(page)).toEqual(['Food', 'Anime', 'Verbs'])
    expect(standIn.sent.slice(-2)).toMatchObject([
      { entity: 'list', operation: 'update', fields: { position: 1 } },
      { entity: 'list', operation: 'update', entityId: verbs, fields: { position: 2 } }
    ])
  })

  test("renames a list, refuses a name the rule refuses, and shows another device's rename when it came first", async () => {
    const standIn = twoLists()
    const { page } = openArea('lists', standIn)
    await shows(page, 'Verbs')
    await click(page, 'Rename Verbs')
    await fill(page, 'Name', '   ')
    await click(page, 'Save')
    await shows(page, 'A list’s name is 1 to 500 characters.')
    expect(standIn.sent).toEqual([])
    standIn.holds('list', verbs, list(verbs, 'Doing words', 1), 2)
    await fill(page, 'Name', 'Actions')
    await click(page, 'Save')
    await shows(page, 'That changed elsewhere first')
    expect(listNames(page)).toEqual(['Food', 'Doing words'])
  })

  test('deletes an empty list at once, and asks before deleting one that has words', async () => {
    const { page, standIn } = openArea('lists', twoLists())
    await shows(page, 'Verbs')
    await click(page, 'Delete Verbs')
    await shows(page, '2 words')
    expect(listNames(page)).toEqual(['Food'])
    await click(page, 'Delete Food')
    await shows(page, 'Delete “Food” and its 2 words?')
    await click(page, 'Keep It')
    expect(standIn.sent.map(each => each.entityId)).toEqual([verbs])
    await click(page, 'Delete Food')
    await click(page, 'Delete List')
    await shows(page, 'You have no lists yet.')
  })

  test('opens one list: its words most recently added first, Known marked and Learning not, one removed, and a refusal said', async () => {
    const standIn = twoLists()
      .holds('knownWord', word(1), { itemId: word(1), ...miru, state: 'learning', known: false })
      .holds(
        'listWord',
        `${verbs}/${word(3)}`,
        onList(verbs, word(3), miru, '2026-10-03T00:00:00Z')
      )
      .hasPage(word(1), '/dictionary/見る-1259290/')
    const { page } = openArea('lists', standIn, { listId: food })
    await shows(page, '2 words')
    expect(linkTexts(page, '[data-slot="item-title"]')).toEqual([
      '食べる（たべる）',
      '見る（みる）'
    ])
    expect(
      [...page.querySelectorAll('[data-slot="item-title"] a')].map(a => a.getAttribute('href'))
    ).toEqual(['/dictionary/search/%E9%A3%9F%E3%81%B9%E3%82%8B/', '/dictionary/見る-1259290/'])
    expect(standIn.pagesAsked.sort()).toEqual([word(1), word(2)])
    const badged = [...page.querySelectorAll('[data-slot="badge"]')]
    expect(badged.map(badge => badge.closest('[data-slot="item"]')?.textContent)).toEqual([
      expect.stringContaining('食べる')
    ])
    await click(page, 'Remove 見る（みる） from this list')
    await shows(page, '1 word')
    standIn.refuseNext('unknown_list')
    await click(page, 'Remove 食べる（たべる） from this list')
    await shows(page, 'That list isn’t in your account anymore.')
  })

  test('says a list the account no longer has is gone', async () => {
    const { page } = openArea('lists', twoLists(), { listId: 'not-a-list' })
    await shows(page, 'That list isn’t in your account.')
    expect(page.textContent).not.toContain('Rename')
  })
})

describe('the account page', () => {
  test('links each kind of synced data', async () => {
    subscriptionAnswering('free')
    const page = renderAccountView()
    await shows(page, 'Your synced data')
    const hrefs = [...page.querySelectorAll('[aria-labelledby="synced-data"] a')].map(a =>
      a.getAttribute('href')
    )
    expect(hrefs).toEqual([
      '/account/known-words/',
      '/account/lists/',
      '/account/notes/',
      '/account/media-library/',
      '/account/recent-videos/',
      '/account/bookmarks/',
      '/account/recent-searches/',
      '/account/settings/'
    ])
  })

  test('points an account without a subscription to the subscription instead', async () => {
    subscriptionAnswering('subscription_required')
    const page = renderAccountView()
    await shows(page, 'Your synced data')
    const section = page.querySelector('[aria-labelledby="synced-data"]')
    expect(section?.textContent).toContain('needs a subscription')
    expect([...(section?.querySelectorAll('a') ?? [])].map(a => a.getAttribute('href'))).toEqual([
      '#subscription'
    ])
  })
})
