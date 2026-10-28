import { afterEach, describe, expect, it } from 'vitest'
import { hostElementName, type ShadowMount } from '../content/shadow-mount'
import { popupAnswer } from '../test/word-cards'
import { wordPopupEvents } from './popup-events'
import { wordPopupHost } from './popup-host'

let fullscreen: Element | null = null

Object.defineProperty(document, 'fullscreenElement', {
  configurable: true,
  get: () => fullscreen
})

afterEach(() => {
  fullscreen = null
  document.body.replaceChildren()
})

function fakeMount(): ShadowMount {
  const host = document.createElement(hostElementName)
  const shadowRoot = host.attachShadow({ mode: 'open' })
  document.body.append(host)
  return { host, shadowRoot, unmount: () => host.remove() }
}

const target = (text: string) => ({
  text,
  ids: ['youkyuu'],
  anchor: () => new DOMRect(0, 0, 10, 10)
})

function popupHost() {
  const said: string[] = []
  const events = wordPopupEvents()
  const heard = (event: Event) => said.push(event.type)
  events.addEventListener('open', heard)
  events.addEventListener('close', heard)
  const host = wordPopupHost({
    settings: () => ({
      lookUp: async id => popupAnswer(id),
      frequency: [],
      romaji: false,
      openFullEntry: () => {}
    }),
    mount: fakeMount
  })
  const shownIn = () => document.querySelector('[data-zenbu-word-popup]')?.parentElement
  const stop = () => {
    host.close()
    events.removeEventListener('open', heard)
    events.removeEventListener('close', heard)
  }
  return { host, said, shownIn, stop }
}

const fullscreenChanges = (element: Element | null) => {
  fullscreen = element
  document.dispatchEvent(new Event('fullscreenchange'))
}

describe('the word popup on a page', () => {
  it('mounts inside the page’s fullscreen element, and moves back when fullscreen ends', () => {
    const player = document.body.appendChild(document.createElement('div'))
    fullscreen = player
    const { host, shownIn, stop } = popupHost()
    host.open(target('要求'))
    expect(shownIn()).toBe(player)
    fullscreenChanges(null)
    expect(shownIn()).toBe(document.body)
    fullscreenChanges(player)
    expect(shownIn()).toBe(player)
    stop()
  })

  it('stays in the body when the fullscreen element is a bare video, which can’t hold it', () => {
    fullscreen = document.body.appendChild(document.createElement('video'))
    const { host, shownIn, stop } = popupHost()
    host.open(target('要求'))
    expect(shownIn()).toBe(document.body)
    stop()
  })

  it('tells the page script’s other parts once when it opens and once when it closes', () => {
    const { host, said, stop } = popupHost()
    host.open(target('要求'))
    host.open(target('要る'))
    expect(said).toEqual(['open'])
    host.close()
    host.close()
    expect(said).toEqual(['open', 'close'])
    host.open(target('要求'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(said).toEqual(['open', 'close', 'open', 'close'])
    stop()
  })
})
