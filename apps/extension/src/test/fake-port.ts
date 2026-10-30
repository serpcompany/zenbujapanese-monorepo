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

export function portPair(name = 'word-popup'): { panel: FakePort; page: FakePort } {
  const panel = fakePort(name)
  const page = fakePort(name)
  const link = (from: FakePort, to: FakePort) => {
    from.postMessage = message => {
      from.posted.push(message)
      queueMicrotask(() => {
        if (!from.disconnected) to.say(message)
      })
    }
    from.disconnect = () => {
      if (from.disconnected) return
      from.disconnected = true
      to.disconnected = true
      queueMicrotask(() => to.drop())
    }
  }
  link(panel, page)
  link(page, panel)
  return { panel, page }
}
