import { vi } from 'vitest'
import type { PagePopupPort } from '../word-popup/page-popup'
import { shownWordPopup, wordPopupEvents } from '../word-popup/popup-events'
import type { PopupHost, PopupTarget } from '../word-popup/popup-host'
import { fakePort } from './fake-port'

export function fakePopupHost() {
  const page = shownWordPopup()
  let current: PopupTarget | null = null
  const self = {
    handOver: () => {
      const previous = current
      current = null
      if (page.current === self) page.current = null
      previous?.closed?.('replaced')
      return { returnTo: null }
    }
  }
  const host = {
    open: vi.fn((target: PopupTarget) => {
      const previous = current
      if (!previous && page.current !== self) page.current?.handOver()
      current = target
      page.current = self
      previous?.closed?.('replaced')
    }),
    close: vi.fn(() => {
      const previous = current
      current = null
      if (!previous) return
      if (page.current === self) page.current = null
      previous.closed?.('closed')
      wordPopupEvents().dispatchEvent(new Event('close'))
    }),
    holds: () => false,
    shown: () => current
  }
  return host satisfies PopupHost
}

type Connected = (port: PagePopupPort) => void

export function fakeRuntime() {
  const listeners = new Set<Connected>()
  const runtime = {
    onConnect: {
      addListener: (listener: Connected) => void listeners.add(listener),
      removeListener: (listener: Connected) => void listeners.delete(listener)
    }
  }
  const connect = <Port extends PagePopupPort>(port: Port) => {
    for (const listener of [...listeners]) listener(port)
    return port
  }
  return {
    runtime,
    listeners,
    connect: (name?: string) => connect(fakePort(name)),
    accept: connect
  }
}
