import type { PagePopupPort } from '../word-popup/page-popup'

export type FakePort = PagePopupPort & {
  posted: unknown[]
  disconnected: boolean
  say(message: unknown): void
  drop(): void
}

export function fakePort(name = 'word-popup'): FakePort {
  const heard = new Set<(message: unknown) => void>()
  const dropped = new Set<() => void>()
  const port: FakePort = {
    name,
    posted: [],
    disconnected: false,
    postMessage: message => void port.posted.push(message),
    disconnect: () => {
      port.disconnected = true
    },
    onMessage: { addListener: listener => void heard.add(listener) },
    onDisconnect: { addListener: listener => void dropped.add(listener) },
    say: message => {
      for (const listener of heard) listener(message)
    },
    drop: () => {
      for (const listener of dropped) listener()
    }
  }
  return port
}
