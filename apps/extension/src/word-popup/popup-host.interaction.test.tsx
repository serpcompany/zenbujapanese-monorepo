import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hostElementName, type ShadowMount } from '../content/shadow-mount'
import { settingDefaults } from '../shared/settings'
import '../test/act-environment'
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

function drawingMount(content: ReactNode): ShadowMount {
  const mounted = fakeMount()
  const root = createRoot(mounted.shadowRoot.appendChild(document.createElement('div')))
  act(() => root.render(content))
  return {
    ...mounted,
    unmount() {
      act(() => root.unmount())
      mounted.unmount()
    }
  }
}

const target = (text: string) => ({
  text,
  ids: ['youkyuu'],
  anchor: () => new DOMRect(0, 0, 10, 10)
})

const pageHost = (mount: (content: ReactNode) => ShadowMount) =>
  wordPopupHost({
    settings: () => ({ lookUp: async id => popupAnswer(id), settings: settingDefaults }),
    mount
  })

function popupHost(mount: (content: ReactNode) => ShadowMount = fakeMount) {
  const said: string[] = []
  const events = wordPopupEvents()
  const heard = (event: Event) => said.push(event.type)
  events.addEventListener('open', heard)
  events.addEventListener('close', heard)
  const host = pageHost(mount)
  const shownIn = () => document.querySelector('[data-zenbu-word-popup]')?.parentElement
  const stop = () => {
    host.close()
    events.removeEventListener('open', heard)
    events.removeEventListener('close', heard)
  }
  return { host, said, shownIn, stop }
}

const menuIn = (shadow: ShadowRoot) => {
  const portal = shadow.appendChild(document.createElement('div'))
  portal.setAttribute('data-base-ui-portal', '')
  const menu = portal.appendChild(document.createElement('div'))
  menu.setAttribute('role', 'menu')
  menu.setAttribute('data-open', '')
  return menu
}

const nextFrame = () => new Promise(done => requestAnimationFrame(() => setTimeout(done, 0)))

const press = (element: Element) =>
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))

const popupShadow = () =>
  document.querySelector('[data-zenbu-word-popup]')?.shadowRoot as ShadowRoot

const pressEscape = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

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

  it('closes once the More menu shuts, when its word scrolled out of the window while the menu was open', async () => {
    let anchor = new DOMRect(0, 0, 10, 10)
    const { host, said, stop } = popupHost(drawingMount)
    host.open({ text: '要求', ids: ['youkyuu'], anchor: () => anchor })
    const menu = menuIn(popupShadow())
    anchor = new DOMRect(0, -500, 10, 10)
    window.dispatchEvent(new Event('scroll'))
    await nextFrame()
    expect(said).toEqual(['open'])
    menu.removeAttribute('data-open')
    await vi.waitFor(() => expect(said).toEqual(['open', 'close']))
    stop()
  })

  it('leaves Escape to an open More menu, and closes on the next one while the menu shuts', () => {
    const { host, said, stop } = popupHost()
    host.open(target('要求'))
    const menu = menuIn(popupShadow())
    pressEscape()
    expect(said).toEqual(['open'])
    menu.removeAttribute('data-open')
    menu.setAttribute('data-closed', '')
    pressEscape()
    expect(said).toEqual(['open', 'close'])
    stop()
  })

  it('draws on a layer of its own over the page, so its menus stack over the popup', () => {
    const { host, stop } = popupHost(drawingMount)
    host.open(target('要求'))
    const layer = document.querySelector<HTMLElement>('[data-zenbu-word-popup]')
    expect(layer?.style.position).toBe('fixed')
    expect(layer?.style.zIndex).toBe('2147483647')
    const box = popupShadow().querySelector<HTMLElement>('[style]')
    expect(box?.style.position).toBe('fixed')
    expect(box?.style.zIndex).toBe('')
    stop()
  })

  it('places a card at the side panel’s edge, level with the word, and keeps it there while the page scrolls', async () => {
    const { host, said, stop } = popupHost(drawingMount)
    const closed = vi.fn()
    host.open({ text: '要求', ids: ['youkyuu'], edge: { side: 'right', top: 300 }, closed })
    const box = popupShadow().querySelector<HTMLElement>('[style]')
    expect(box?.dataset.side).toBe('beside')
    expect(box?.style.left).toBe(`${window.innerWidth - 8}px`)
    expect(box?.style.top).toBe('300px')
    window.dispatchEvent(new Event('scroll'))
    await nextFrame()
    expect(said).toEqual(['open'])
    expect(closed).not.toHaveBeenCalled()
    host.close()
    expect(closed).toHaveBeenCalledExactlyOnceWith('closed')
    stop()
  })

  it('tells the one who opened a card when it goes, whether it closes or another card takes its place', () => {
    const { host, stop } = popupHost()
    const first = vi.fn()
    const second = vi.fn()
    host.open({ ...target('要求'), closed: first })
    host.open({ ...target('要る'), closed: second })
    expect(first).toHaveBeenCalledExactlyOnceWith('replaced')
    expect(second).not.toHaveBeenCalled()
    pressEscape()
    expect(second).toHaveBeenCalledExactlyOnceWith('closed')
    stop()
  })

  it('shows one card on a page: another part’s card takes the place of this one, without a close between', () => {
    const { host, said, stop } = popupHost()
    const other = pageHost(fakeMount)
    const closed = vi.fn()
    host.open({ ...target('要求'), closed })
    other.open(target('要る'))
    expect(document.querySelectorAll('[data-zenbu-word-popup]')).toHaveLength(1)
    expect(closed).toHaveBeenCalledExactlyOnceWith('replaced')
    expect(said).toEqual(['open'])
    host.close()
    expect(said).toEqual(['open'])
    pressEscape()
    expect(document.querySelectorAll('[data-zenbu-word-popup]')).toHaveLength(0)
    expect(said).toEqual(['open', 'close'])
    stop()
  })

  it('stays open for a press in a layer it opened, and closes for a press on the page', () => {
    const { host, said, stop } = popupHost()
    host.open(target('要求'))
    press(menuIn(popupShadow()))
    expect(said).toEqual(['open'])
    press(document.body)
    expect(said).toEqual(['open', 'close'])
    stop()
  })
})
