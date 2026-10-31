import { type PanelPort, type TabPort, videoTabPort } from '../video/video-tab-port'

type Callback = (...args: never[]) => void

const noReceiver = { message: 'Could not establish connection. Receiving end does not exist.' }

function callbacks<Listener extends Callback>() {
  const all: Listener[] = []
  return {
    run(...args: Parameters<Listener>) {
      for (const listener of [...all]) listener(...args)
    },
    addListener(listener: Listener) {
      all.push(listener)
    },
    removeListener(listener: Listener) {
      const at = all.indexOf(listener)
      if (at !== -1) all.splice(at, 1)
    },
    get count() {
      return all.length
    }
  }
}

export function videoTabPortsStandIn() {
  const receivers = new Map<number, ReturnType<typeof callbacks<(port: TabPort) => void>>>()
  const posted: unknown[] = []
  let lastError: typeof noReceiver | undefined

  const onConnect = (tabId: number) => {
    const known = receivers.get(tabId) ?? callbacks<(port: TabPort) => void>()
    receivers.set(tabId, known)
    return known
  }

  function connect(tabId: number, name = videoTabPort): PanelPort {
    const toPanel = callbacks<(message: unknown) => void>()
    const panelClosed = callbacks<() => void>()
    const tabClosed = callbacks<() => void>()
    let connected = true
    const cut = (other: typeof panelClosed) => {
      if (!connected) return
      connected = false
      queueMicrotask(() => other.run())
    }
    const tabSide: TabPort = {
      name,
      postMessage(message) {
        const copy = structuredClone(message)
        posted.push(copy)
        if (connected) queueMicrotask(() => toPanel.run(copy))
      },
      disconnect: () => cut(panelClosed),
      onDisconnect: tabClosed
    }
    const receiving = onConnect(tabId)
    if (receiving.count === 0) {
      connected = false
      queueMicrotask(() => {
        lastError = noReceiver
        panelClosed.run()
        lastError = undefined
      })
    } else queueMicrotask(() => receiving.run(tabSide))
    return { disconnect: () => cut(tabClosed), onMessage: toPanel, onDisconnect: panelClosed }
  }

  return { connect, onConnect, posted, lastError: () => lastError }
}
