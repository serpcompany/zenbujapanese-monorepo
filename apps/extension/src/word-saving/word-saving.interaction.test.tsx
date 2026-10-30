import { fill } from '@zenbu/dictionary-core/detail/template'
import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { PronounceWithoutLocalVoice } from '@zenbu/ui/dictionary/pronounce-button'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountPage } from '../shared/account'
import { favoritesList } from '../shared/account-copy'
import { settingDefaults } from '../shared/settings'
import {
  byText,
  click,
  find,
  type Rendered,
  render,
  settle,
  stubIntersectionObserver,
  typeInto
} from '../test/render'
import { savingStandIn } from '../test/saving-stand-in'
import { openFullEntryButton, youkyuu } from '../test/word-cards'
import { wordDetailLabels } from '../word-detail/labels'
import { notePause } from '../word-detail/word-saved'
import { WordPopup } from '../word-popup/word-popup'

vi.mock('../shared/dictionary', async importOriginal => {
  const { fixtureWordRows: fixtures } = await import('@zenbu/dictionary-core/fixtures')
  const real = await importOriginal<typeof import('../shared/dictionary')>()
  const rowsOf = (entSeq: number) => fixtures.find(rows => rows.entry.entSeq === entSeq)
  return { ...real, lookUpWord: async (entSeq: number) => ({ type: 'word', rows: rowsOf(entSeq) }) }
})

vi.mock(
  '../shared/dictionary-progress',
  async () => (await import('../test/data-state')).fakeDictionaryProgress
)

const labels = wordDetailLabels.saving

const item = fixtureWordRows.find(rows => rows.entry.entSeq === youkyuu.entSeq)?.entry.id ?? ''

const card = { ...youkyuu, languageReferenceID: item }

let shown: Rendered | undefined

let saving = savingStandIn()

beforeEach(() => {
  saving = savingStandIn()
  stubIntersectionObserver()
})

afterEach(() => {
  shown?.unmount()
  shown = undefined
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function showPopup() {
  shown = render(
    <PronounceWithoutLocalVoice value="unsupported">
      <WordPopup
        text="要求"
        ids={[item]}
        lookUp={async () => ({ type: 'popup', card: { card, romaji: null } })}
        settings={settingDefaults}
        saving={saving.port}
      />
    </PronounceWithoutLocalVoice>
  )
  await settle()
  return find(shown.container, '[data-word-popup]')
}

const popup = () => find(shown?.container ?? document, '[data-word-popup]')

async function openMenu() {
  await click(find(popup(), '[aria-haspopup="menu"]'))
  return find(document, '[role="menu"]')
}

const checked = (menu: HTMLElement, role: string) =>
  [...menu.querySelectorAll(`[role="${role}"]`)].map(choice => [
    choice.textContent,
    choice.getAttribute('aria-checked')
  ])

const toast = () => popup().querySelector<HTMLElement>('[data-saving-toast]')

async function choose(name: string) {
  await click(byText(await openMenu(), '[role="menuitemradio"]', name))
}

function typeNote(field: HTMLElement, text: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(field, text)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('the word’s ••• menu', () => {
  it('offers Status with the word’s state checked, then Add to List… and Add Note, and no Copy Link', async () => {
    await showPopup()
    const menu = await openMenu()
    expect(find(menu, '[data-slot="dropdown-menu-label"]').textContent).toBe(labels.status)
    expect(checked(menu, 'menuitemradio')).toEqual([
      ['Unknown', 'true'],
      ['Learning', 'false'],
      ['Known', 'false']
    ])
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(each => each.textContent)).toEqual([
      labels.addToList,
      labels.addNote
    ])
  })

  it('marks the word Known, says so with Undo, and Undo puts back the state it had', async () => {
    await showPopup()
    await choose('Learning')
    expect(toast()).toBeNull()
    await choose('Known')
    expect(saving.changes.at(-1)).toEqual({
      change: 'set',
      item,
      headword: '要求',
      reading: 'ようきゅう',
      state: 'known'
    })
    expect(toast()?.textContent).toContain(fill(labels.known.title, { name: '要求' }))
    expect(toast()?.textContent).toContain(labels.known.text)
    expect(checked(await openMenu(), 'menuitemradio')[2]).toEqual(['Known', 'true'])
    await click(byText(popup(), 'button', labels.known.action))
    expect(saving.changes.at(-1)).toMatchObject({ change: 'set', state: 'learning' })
    expect(toast()).toBeNull()
  })

  it('signed out, saves nothing and offers Sign In, without showing the toast again while it’s up', async () => {
    saving.refuse('signed-out')
    await showPopup()
    await choose('Known')
    await choose('Learning')
    expect(saving.changes).toEqual([])
    expect(popup().querySelectorAll('[data-saving-toast="signed-out"]')).toHaveLength(1)
    expect(toast()?.textContent).toContain(labels.signedOut.title)
    await click(byText(popup(), 'button', labels.signedOut.action))
    expect(saving.port.signIn).toHaveBeenCalledOnce()
    expect(toast()).toBeNull()
  })

  it('without the subscription, Add to List… and Add Note show the subscription toast, whose Subscribe… opens the account page', async () => {
    saving.refuse('subscription-required')
    await showPopup()
    await click(byText(await openMenu(), '[role="menuitem"]', labels.addToList))
    expect(toast()?.dataset.savingToast).toBe('subscription-required')
    expect(document.querySelector('[role="menuitemcheckbox"]')).toBeNull()
    await click(byText(await openMenu(), '[role="menuitem"]', labels.addNote))
    expect(popup().hasAttribute('data-expanded')).toBe(false)
    const subscribe = byText(popup(), 'a', labels.subscription.action) as HTMLAnchorElement
    expect([subscribe.href, subscribe.target]).toEqual([accountPage, '_blank'])
    expect(saving.changes).toEqual([])
  })

  it('Add to List… checks the lists that hold the word, adds or removes it at once, and New List names a list', async () => {
    await showPopup()
    await click(byText(await openMenu(), '[role="menuitem"]', labels.addToList))
    const favorites = byText(document, '[role="menuitemcheckbox"]', 'Favorites')
    expect(favorites.getAttribute('aria-checked')).toBe('false')
    await click(favorites)
    expect(saving.changes.at(-1)).toMatchObject({ change: 'add-word', list: favoritesList, item })
    expect(favorites.getAttribute('aria-checked')).toBe('true')
    await click(favorites)
    expect(saving.changes.at(-1)).toEqual({ change: 'remove-word', list: favoritesList, item })
    await click(byText(document, '[role="menuitem"]', labels.newList))
    const name = find(document, `input[aria-label="${labels.listName}"]`)
    typeInto(name, 'Verbs')
    await click(byText(document, 'button', labels.create))
    expect(saving.changes.at(-1)).toMatchObject({ change: 'add-word', name: 'Verbs', item })
    expect(saving.view(item).lists.map(list => [list.name, list.holds])).toEqual([
      ['Favorites', false],
      ['Verbs', true]
    ])
  })
})

describe('Word Detail’s saving', () => {
  it('Add Note expands the card with the note focused; a note saves after a pause and on blur, and an empty one goes', async () => {
    await showPopup()
    await click(byText(await openMenu(), '[role="menuitem"]', labels.addNote))
    expect(popup().hasAttribute('data-expanded')).toBe(true)
    await settle()
    const field = find(popup(), `textarea[aria-label="${fill(labels.note, { name: '要求' })}"]`)
    expect(document.activeElement).toBe(field)
    vi.useFakeTimers()
    typeNote(field, 'From the news')
    expect(saving.changes).toEqual([])
    await act(async () => vi.advanceTimersByTime(notePause))
    expect(saving.changes.at(-1)).toMatchObject({
      change: 'write-note',
      item,
      text: 'From the news'
    })
    typeNote(field, '')
    act(() => field.blur())
    await act(async () => vi.advanceTimersByTime(notePause))
    expect(saving.changes.at(-1)).toMatchObject({ change: 'delete-note' })
    expect(saving.changes).toHaveLength(2)
  })

  it('shows the ◐ Learning and ✓ Known tags, the lists that hold the word, and its own ••• follows the state', async () => {
    await showPopup()
    await click(byText(await openMenu(), '[role="menuitem"]', labels.addToList))
    await click(byText(document, '[role="menuitemcheckbox"]', 'Favorites'))
    await click(openFullEntryButton(popup()))
    await settle()
    expect(popup().querySelector('[data-state-tag]')).toBeNull()
    expect(find(popup(), '[data-word-lists]').textContent).toBe('Favorites')
    await choose('Learning')
    expect(find(popup(), 'h1 ~ [data-state-tag]').textContent).toBe(labels.tags.learning)
    await choose('Known')
    expect(find(popup(), '[data-state-tag]').textContent).toBe(labels.tags.known)
    expect(checked(await openMenu(), 'menuitemradio')[2]).toEqual(['Known', 'true'])
  })
})

describe('a refusal told later', () => {
  it('shows for this page, not for another, and goes when the account changes', async () => {
    await showPopup()
    act(() => saving.tell({ refusal: 'subscription-required', page: 'https://elsewhere.example/' }))
    expect(toast()).toBeNull()
    act(() => saving.tell({ refusal: 'subscription-required', page: 'https://example.com/' }))
    expect(toast()?.dataset.savingToast).toBe('subscription-required')
    act(() => saving.tell({ refusal: null }))
    expect(toast()).toBeNull()
  })
})
