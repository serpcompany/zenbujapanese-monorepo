import { act, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { askAccount } from '../shared/account'
import { askCopy, type CopyChange, changeWord } from '../shared/account-copy'
import type { PanelPage } from '../side-panel/route'
import { json, refusal, signedInAnswer, startAccountOn, user } from '../test/account-stand-in'
import { appliedTo, type Sync, syncAnswer } from '../test/copy-stand-in'
import { gated, otherWord, subscribed, word } from '../test/copy-world'
import { startExtension } from '../test/extension'
import { find, keyClick, pointerClick, type Rendered, render, settle } from '../test/render'
import { openFullEntryButton, youkyuu } from '../test/word-cards'
import type { PagePopup, PagePopupHeard } from '../word-popup/page-popup'
import { savedWordsLabels as labels } from './labels'
import { KnownWordsPage, LearningPage, ListPage, ListsPage, NotesPage } from './saved-pages'
import { SavedWords } from './saved-words'
import type { SavedWordServices } from './word-rows'

const list = '5a3f2c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b'

const note = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

type SyncRoute = (body: Sync) => Response | Promise<Response>

const applied: SyncRoute = body => json(200, syncAnswer(appliedTo(body)))

let shown: Rendered[] = []

afterEach(() => {
  for (const each of shown) each.unmount()
  shown = []
  document.body.replaceChildren()
})

function show(node: ReactNode) {
  const rendered = render(node)
  shown.push(rendered)
  return rendered.container
}

async function signedIn(route: { sync: SyncRoute } = { sync: applied }) {
  startAccountOn(startExtension(), {
    'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-1'),
    'GET /v1/auth/token': () => json(200, { token: 'access-1' }),
    'GET /v1/me/subscription': () => json(200, subscribed),
    'POST /v1/sync': asked => route.sync(asked.body as Sync)
  })
  await askAccount({ account: 'sign-in', with: { way: 'code', email: user.email, code: '123456' } })
  await askCopy({ copy: 'sync' })
}

async function changed(...changes: CopyChange[]) {
  await act(async () => {
    for (const change of changes) {
      await askCopy({ copy: 'change', change })
      await new Promise(resolve => setTimeout(resolve, 2))
    }
  })
  await settle()
}

const known = { change: 'set', ...word, state: 'known' } as const

const opens = <Kind extends PanelPage['page']>(page: Extract<PanelPage, { page: Kind }>) => ({
  page,
  open: vi.fn()
})

const counts = (scope: ParentNode) =>
  Object.fromEntries(
    [...scope.querySelectorAll('button')].flatMap(row => {
      const count = row.querySelector('[data-count]')
      const title = row.querySelector('[data-slot="item-title"]')?.textContent
      return count && title ? [[title, count.textContent]] : []
    })
  )

const savedWords = (scope: ParentNode) =>
  [...scope.querySelectorAll('[data-saved-word], [data-saved-kanji]')].map(row => ({
    item: row.getAttribute('data-saved-word') ?? row.getAttribute('data-saved-kanji'),
    title: row.querySelector('[data-slot="item-title"]')?.textContent,
    description: row.querySelector('[data-slot="item-description"]')?.textContent ?? null,
    tag: row.querySelector('[data-state-tag]')?.getAttribute('data-state-tag') ?? null
  }))

const emptyTitle = (scope: ParentNode) =>
  scope.querySelector('[data-slot="empty-title"]')?.textContent

const eating = {
  type: 'popup' as const,
  card: {
    card: {
      ...youkyuu,
      languageReferenceID: word.item,
      headword: word.headword,
      reading: word.reading,
      furigana: [{ base: word.headword, reading: word.reading }],
      meanings: [{ meaning: 'to eat', notes: [], partsOfSpeech: ['Verb'] }]
    },
    romaji: null
  }
}

function onThePage() {
  const asked: { word: Parameters<PagePopup>[0]; heard: PagePopupHeard; close: () => void }[] = []
  const services: SavedWordServices = {
    popupCard: vi.fn(async (id: string) =>
      id === word.item ? eating : { type: 'popup' as const, card: null }
    ),
    pagePopup: (shownWord, heard) => {
      const close = vi.fn()
      asked.push({ word: shownWord, heard, close })
      return close
    }
  }
  const hear = (event: keyof PagePopupHeard, index = 0) =>
    act(async () => asked[index]?.heard[event]())
  return { asked, services, hear }
}

const popup = () => document.querySelector('[data-word-popup]')

describe("the Account tab's saved words", () => {
  it('lists a word marked Known in this browser in Known Words at once, and takes it out when it is marked Unknown', async () => {
    await signedIn()
    const tab = show(<SavedWords open={vi.fn()} />)
    const page = show(<KnownWordsPage {...opens({ page: 'known-words' })} />)
    await settle()
    expect(counts(tab)[labels.knownWords]).toBe('0')
    expect(emptyTitle(page)).toBe(labels.empty.knownWords.title)
    await act(() => changeWord(word.item, known))
    await settle()
    expect(counts(tab)[labels.knownWords]).toBe('1')
    expect(savedWords(page)).toMatchObject([
      { item: word.item, title: '食べる【たべる】', tag: 'known' }
    ])
    await act(() => changeWord(word.item, { change: 'set', item: word.item, state: 'unknown' }))
    await settle()
    expect(counts(tab)[labels.knownWords]).toBe('0')
    expect(savedWords(page)).toEqual([])
    expect(emptyTitle(page)).toBe(labels.empty.knownWords.title)
  })

  it('counts each row, and opens Known Words, Learning, Lists, and Notes from it', async () => {
    await signedIn()
    const open = vi.fn()
    const tab = show(<SavedWords open={open} />)
    await changed(
      known,
      { change: 'set', ...otherWord, state: 'learning' },
      { change: 'write-note', note, text: 'Ichidan.', ...word }
    )
    expect(counts(tab)).toEqual({
      [labels.knownWords]: '1',
      [labels.learning]: '1',
      [labels.lists]: '1',
      [labels.notes]: '1'
    })
    for (const row of tab.querySelectorAll('button[data-slot="item"]')) {
      await act(async () => (row as HTMLElement).click())
    }
    expect(open.mock.calls).toEqual([
      [{ page: 'known-words' }],
      [{ page: 'learning' }],
      [{ page: 'lists' }],
      [{ page: 'notes' }]
    ])
  })

  it('lists Learning and a kanji newest first, a list most recently added first, and each note with its word', async () => {
    await signedIn()
    const lists = opens({ page: 'lists' })
    const pages = {
      learning: show(<LearningPage {...opens({ page: 'learning' })} />),
      known: show(<KnownWordsPage {...opens({ page: 'known-words' })} />),
      lists: show(<ListsPage {...lists} />),
      list: show(<ListPage {...opens({ page: 'list', list })} />),
      notes: show(<NotesPage {...opens({ page: 'notes' })} />)
    }
    await settle()
    expect([pages.learning, pages.known, pages.notes, pages.list].map(emptyTitle)).toEqual([
      labels.empty.learning.title,
      labels.empty.knownWords.title,
      labels.empty.notes.title,
      labels.empty.listGone.title
    ])
    await changed(
      { change: 'set', ...otherWord, state: 'learning' },
      { change: 'set', ...word, state: 'learning' },
      { change: 'mark', item: 'kanji:食', headword: '食', reading: '' },
      { change: 'create-list', list, name: 'N5', position: 1 },
      { change: 'add-word', list, ...word },
      { change: 'add-word', list, ...otherWord },
      { change: 'write-note', note, text: 'Godan.', ...otherWord }
    )
    expect(savedWords(pages.learning).map(row => row.item)).toEqual([word.item, otherWord.item])
    expect(savedWords(pages.known)).toEqual([
      { item: 'kanji:食', title: '食', description: labels.kanji, tag: 'known' }
    ])
    expect(counts(pages.lists)).toEqual({ Favorites: '0', N5: '2' })
    expect(find(pages.list, 'h2').textContent).toBe('N5')
    expect(savedWords(pages.list).map(row => [row.item, row.tag])).toEqual([
      [otherWord.item, 'learning'],
      [word.item, 'learning']
    ])
    expect(savedWords(pages.notes)).toMatchObject([
      { item: otherWord.item, title: '飲む【のむ】', description: 'Godan.', tag: 'learning' }
    ])
    await act(async () => find(pages.lists, 'button:last-of-type').click())
    expect(lists.open).toHaveBeenLastCalledWith({ page: 'list', list })
    await changed({ change: 'delete-list', list })
    expect(emptyTitle(pages.list)).toBe(labels.empty.listGone.title)
  })

  it("opens a word's card on the page with a click, and in the panel with Enter or Space or where the page can't show one", async () => {
    await signedIn()
    await askCopy({ copy: 'change', change: known })
    const page = onThePage()
    const view = show(
      <KnownWordsPage {...opens({ page: 'known-words' })} services={page.services} />
    )
    await settle()
    const row = find(view, `[data-saved-word="${word.item}"]`)
    expect(savedWords(view)[0]?.description).toBe('to eat')
    await pointerClick(row)
    expect(page.asked[0]?.word).toEqual({
      text: word.headword,
      ids: [word.item],
      fromBottom: window.innerHeight - row.getBoundingClientRect().top
    })
    await page.hear('shown')
    expect(popup()).toBeNull()
    await keyClick(row, ' ')
    expect(page.asked[1]?.word.inPanel).toBe(true)
    expect(view.querySelector('[data-word-popup]')?.getAttribute('aria-label')).toBe('Word 食べる')
    expect(popup()?.contains(document.activeElement)).toBe(true)
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    })
    await settle()
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(row)
    await pointerClick(row)
    await page.hear('unavailable', 2)
    expect(view.querySelector('[data-word-popup]')).not.toBeNull()
    await act(async () => openFullEntryButton(view).click())
    await settle()
    expect(popup()?.hasAttribute('data-expanded')).toBe(true)
  })

  it('syncs on Sync Now, with when it last synced, how many changes wait, and words from another device', async () => {
    const route = { sync: (_body: Sync) => json(503, {}) }
    await signedIn(route)
    const tab = show(<SavedWords open={vi.fn()} />)
    await changed(known)
    const state = () => ({
      sync: find(tab, '[data-sync]').getAttribute('data-sync'),
      last: find(tab, '[data-last-synced]').textContent,
      waiting: tab.querySelector('[data-waiting]')?.textContent ?? null,
      note: tab.querySelector('[data-sync-note]')?.textContent ?? null
    })
    expect(state()).toEqual({
      sync: 'waiting',
      last: labels.sync.notYet,
      waiting: `${labels.sync.waiting}: 1`,
      note: labels.sync.notes.waiting
    })
    route.sync = body =>
      json(
        200,
        syncAnswer(appliedTo(body), [
          {
            entity: 'knownWord',
            entityId: otherWord.item,
            operation: 'mark',
            version: 1,
            data: {
              itemId: otherWord.item,
              headword: otherWord.headword,
              reading: otherWord.reading,
              state: 'known',
              known: true,
              stateChangedAt: '2026-10-29T08:00:00.000Z'
            }
          }
        ])
      )
    await act(async () => find(tab, '[data-sync] button').click())
    await settle()
    expect(state()).toEqual({ sync: 'synced', last: 'now', waiting: null, note: null })
    expect(counts(tab)[labels.knownWords]).toBe('2')
  })

  it.each<[string, SyncRoute, string | undefined]>([
    [
      'subscription-required',
      () => refusal(402, 'subscription_required'),
      labels.sync.notes['subscription-required']
    ],
    ['offline', () => Promise.reject(new TypeError('Failed to fetch')), labels.sync.notes.offline],
    ['failed', () => refusal(422, 'unprocessable'), labels.sync.notes.failed]
  ])('says why Sync Now did not sync when it is %s', async (sync, refusing, note) => {
    const route = { sync: applied }
    await signedIn(route)
    const tab = show(<SavedWords open={vi.fn()} />)
    let asked = 0
    route.sync = body => {
      asked += 1
      return refusing(body)
    }
    await changed(known)
    const before = asked
    await act(async () => find(tab, '[data-sync] button').click())
    await settle()
    expect(asked).toBeGreaterThan(before)
    expect(find(tab, '[data-sync]').getAttribute('data-sync')).toBe(sync)
    expect(find(tab, '[data-sync-note]').textContent).toBe(note)
    expect(find(tab, '[data-waiting]').textContent).toBe(`${labels.sync.waiting}: 1`)
    expect((find(tab, '[data-sync] button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('says Syncing… and holds Sync Now until the sync answers', async () => {
    const route = { sync: applied }
    await signedIn(route)
    const tab = show(<SavedWords open={vi.fn()} />)
    await changed(known)
    const answering = gated()
    route.sync = async body => {
      await answering.gate
      return applied(body)
    }
    await act(async () => find(tab, '[data-sync] button').click())
    expect(find(tab, '[data-last-synced]').textContent).toBe(labels.sync.syncing)
    expect((find(tab, '[data-sync] button') as HTMLButtonElement).disabled).toBe(true)
    answering.open()
    await settle()
    expect(find(tab, '[data-last-synced]').textContent).toBe('now')
    expect((find(tab, '[data-sync] button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows a note with Try Again when the first read of the copy fails, and the section when it is read again', async () => {
    await signedIn()
    const reach = chrome.runtime.sendMessage
    let reachable = false
    chrome.runtime.sendMessage = ((message: unknown) =>
      reachable
        ? reach(message)
        : Promise.reject(new Error('The service worker is restarting.'))) as typeof reach
    const tab = show(<SavedWords open={vi.fn()} />)
    const page = show(<KnownWordsPage {...opens({ page: 'known-words' })} />)
    await settle()
    expect(find(tab, '[data-sync-note]').textContent).toBe(labels.sync.unread)
    expect(find(page, '[data-sync-note]').textContent).toBe(labels.sync.unread)
    expect(tab.querySelector('button[data-slot="item"]')).toBeNull()
    reachable = true
    await act(async () => find(tab, '[data-sync] button').click())
    await settle()
    expect(tab.querySelector('[data-sync-note]')).toBeNull()
    expect(counts(tab)[labels.knownWords]).toBe('0')
    expect(find(tab, '[data-sync]').getAttribute('data-sync')).not.toBe('unread')
    await act(async () => find(page, '[data-sync] button').click())
    await settle()
    expect(emptyTitle(page)).toBe(labels.empty.knownWords.title)
  })
})
