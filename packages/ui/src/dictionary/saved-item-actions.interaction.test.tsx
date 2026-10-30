import { CheckIcon, LinkIcon, ListPlusIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PortalContainer } from '../lib/portal'
import { SavedItemActions, type SavedItemPage, type SavedItemStatus } from './saved-item-actions'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let shadow: ShadowRoot
let root: Root

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>'
  host = document.getElementById('host') as HTMLDivElement
  shadow = host.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  shadow.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
})

function renderActions(onSelect: (id: string) => void) {
  const share = vi.fn()
  act(() =>
    root.render(
      <PortalContainer value={shadow}>
        <SavedItemActions
          share={{ label: 'Share 要', onSelect: share }}
          moreActions="More for 要"
          groups={[
            [
              { id: 'known', icon: CheckIcon, label: 'Known', onSelect: () => onSelect('known') },
              { id: 'note', icon: PencilIcon, label: 'Note', onSelect: () => onSelect('note') }
            ],
            [{ id: 'copy', icon: LinkIcon, label: 'Copy', onSelect: () => onSelect('copy') }]
          ]}
        />
      </PortalContainer>
    )
  )
  return share
}

function button(name: string): HTMLButtonElement {
  const found = shadow.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!found) throw new Error(`No button named ${name}`)
  return found
}

async function openMenu() {
  const trigger = button('More for 要')
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    trigger.click()
  })
}

const items = () =>
  [...shadow.querySelectorAll('[data-slot="dropdown-menu-item"]')].map(item => item.textContent)

describe('saved item actions', () => {
  test('Share calls the client with the label the client named it by', async () => {
    const share = renderActions(() => {})
    await act(async () => button('Share 要').click())
    expect(share).toHaveBeenCalledOnce()
  })

  test('the menu opens inside the shadow root it was given, in its groups', async () => {
    renderActions(() => {})
    await openMenu()
    expect(items()).toEqual(['Known', 'Note', 'Copy'])
    expect(shadow.querySelectorAll('[data-slot="dropdown-menu-separator"]')).toHaveLength(1)
    expect(document.body.querySelector('[data-slot="dropdown-menu-item"]')).toBeNull()
  })

  test('choosing an action calls its own handler', async () => {
    const chosen = vi.fn()
    renderActions(chosen)
    await openMenu()
    const note = [...shadow.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]')].find(
      item => item.textContent === 'Note'
    )
    await act(async () => note?.click())
    expect(chosen).toHaveBeenCalledExactlyOnceWith('note')
  })
})

function renderSaving(status: SavedItemStatus, page: SavedItemPage) {
  act(() =>
    root.render(
      <PortalContainer value={shadow}>
        <SavedItemActions
          share={{ label: 'Share 要', onSelect: () => {} }}
          moreActions="More for 要"
          status={status}
          groups={[[page]]}
        />
      </PortalContainer>
    )
  )
}

function savingMenu(disabled?: boolean) {
  const status = {
    disabled,
    label: 'Status',
    value: 'learning',
    choices: [
      { value: 'unknown', label: 'Unknown' },
      { value: 'learning', label: 'Learning' },
      { value: 'known', label: 'Known' }
    ],
    onValueChange: vi.fn()
  }
  const newList = vi.fn()
  const page = {
    id: 'lists',
    icon: ListPlusIcon,
    label: 'Add to List…',
    title: 'Lists',
    back: 'Back',
    choices: [
      { id: 'favorites', label: 'Favorites', checked: false },
      { id: 'n5', label: 'N5', checked: true }
    ],
    onChoose: vi.fn(),
    actions: [{ id: 'new', icon: PlusIcon, label: 'New List', onSelect: newList }]
  }
  renderSaving(status, page)
  return { status, page, newList }
}

const named = (slot: string, name: string) => {
  const found = [...shadow.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`)].find(
    item => item.textContent === name
  )
  if (!found) throw new Error(`No ${slot} named ${name}`)
  return found
}

const open = () => shadow.querySelector('[data-slot="dropdown-menu-content"]') !== null

describe('saved item actions with a status and a page of choices', () => {
  test('Status comes first, labeled, with the state checked, and a choice closes the menu', async () => {
    const { status } = savingMenu()
    await openMenu()
    expect(shadow.querySelector('[data-slot="dropdown-menu-label"]')?.textContent).toBe('Status')
    const radios = [...shadow.querySelectorAll('[data-slot="dropdown-menu-radio-item"]')]
    expect(radios.map(radio => [radio.textContent, radio.getAttribute('aria-checked')])).toEqual([
      ['Unknown', 'false'],
      ['Learning', 'true'],
      ['Known', 'false']
    ])
    await act(async () => named('dropdown-menu-radio-item', 'Known').click())
    expect(status.onValueChange).toHaveBeenCalledExactlyOnceWith('known')
    await vi.waitFor(() => expect(open()).toBe(false))
  })

  test('a disabled Status shows its choices but takes none', async () => {
    const { status } = savingMenu(true)
    await openMenu()
    const known = named('dropdown-menu-radio-item', 'Known')
    expect(known.getAttribute('aria-disabled')).toBe('true')
    await act(async () => known.click())
    expect(status.onValueChange).not.toHaveBeenCalled()
  })

  test('a page opens in place with Back, its checked choices and its actions, and stays open on a choice', async () => {
    const { page, newList } = savingMenu()
    await openMenu()
    await act(async () => named('dropdown-menu-item', 'Add to List…').click())
    expect(items()).toEqual(['Back', 'New List'])
    const boxes = [...shadow.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]')]
    expect(boxes.map(box => [box.textContent, box.getAttribute('aria-checked')])).toEqual([
      ['Favorites', 'false'],
      ['N5', 'true']
    ])
    await act(async () => named('dropdown-menu-checkbox-item', 'Favorites').click())
    expect(page.onChoose).toHaveBeenCalledExactlyOnceWith('favorites', true)
    expect(open()).toBe(true)
    await act(async () => named('dropdown-menu-item', 'Back').click())
    expect(items()).toEqual(['Add to List…'])
    await act(async () => named('dropdown-menu-item', 'Add to List…').click())
    await act(async () => named('dropdown-menu-item', 'New List').click())
    expect(newList).toHaveBeenCalledOnce()
  })

  test('the menu opens on its first page again after it closes', async () => {
    savingMenu()
    await openMenu()
    await act(async () => named('dropdown-menu-item', 'Add to List…').click())
    await act(async () =>
      named('dropdown-menu-item', 'Back').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    )
    await vi.waitFor(() => expect(open()).toBe(false))
    await openMenu()
    expect(items()).toEqual(['Add to List…'])
  })
})
