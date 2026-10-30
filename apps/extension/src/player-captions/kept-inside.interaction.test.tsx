import { afterEach, describe, expect, it } from 'vitest'
import { keptInside } from './kept-inside'

const heard: string[] = []
const hear = (event: KeyboardEvent) => void heard.push(event.key)

function mounted() {
  const host = document.body.appendChild(document.createElement('div'))
  const shadowRoot = host.attachShadow({ mode: 'open' })
  keptInside({ host, shadowRoot })
  const portal = shadowRoot.appendChild(document.createElement('div'))
  portal.setAttribute('data-base-ui-portal', '')
  const menu = portal.appendChild(document.createElement('div'))
  menu.setAttribute('role', 'menu')
  document.addEventListener('keydown', hear)
  return menu
}

const press = (key: string, target: Element) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }))

afterEach(() => {
  document.removeEventListener('keydown', hear)
  document.body.replaceChildren()
  heard.length = 0
})

describe('keys inside the popup host', () => {
  it('keeps a menu’s own keys inside only while the menu is open, not while it fades out', () => {
    const menu = mounted()
    menu.setAttribute('data-open', '')
    press('ArrowDown', menu)
    press('m', menu)
    expect(heard).toEqual([])

    menu.removeAttribute('data-open')
    menu.setAttribute('data-closed', '')
    press('ArrowDown', menu)
    press('m', menu)
    expect(heard).toEqual(['ArrowDown', 'm'])
  })

  it('keeps the keys that scroll inside while the card is expanded into its full entry', () => {
    const menu = mounted()
    const card = menu.getRootNode().appendChild(document.createElement('div'))
    card.setAttribute('data-word-popup', '')
    press('PageDown', card)
    card.setAttribute('data-expanded', '')
    press('ArrowDown', card)
    press('End', card)
    press('m', card)
    expect(heard).toEqual(['PageDown', 'm'])
  })
})
