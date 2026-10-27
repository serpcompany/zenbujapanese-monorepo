import { CheckIcon, LinkIcon, PencilIcon } from 'lucide-react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PortalContainer } from '../lib/portal'
import { SavedItemActions } from './saved-item-actions'

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
