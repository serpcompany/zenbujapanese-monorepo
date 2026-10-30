import type { PageSettings, Settings } from '../shared/settings'
import { type PagePopupPort, pagePopupPort, shownRequest } from './page-popup'
import { type HandedOver, shownWordPopup, wordPopupEvents } from './popup-events'
import type { CardGone, PopupHost } from './popup-host'

type Connected = (port: PagePopupPort) => void

type PageRuntime = {
  onConnect: { addListener(listener: Connected): void; removeListener(listener: Connected): void }
}

type Options = {
  runtime: PageRuntime
  view: Window
  settings: PageSettings
  on(settings: Settings): boolean
  popup(settings: () => Settings): PopupHost
  preferred?: boolean
}

type Server = { preferred: boolean }

type Place = { handOver(): HandedOver | null }

type Held = { port: PagePopupPort; place: Place; before: HandedOver | null }

const serversKey = Symbol.for('zenbujapanese.page-popup-servers')

type Frame = { [serversKey]?: Server[] }

function frameServers(frame: Frame = globalThis as Frame): Server[] {
  frame[serversKey] ??= []
  return frame[serversKey]
}

const answering = (servers: readonly Server[]) =>
  servers.find(server => server.preferred) ?? servers[0]

const pressEnds = ['pointerup', 'pointercancel'] as const

export function servePagePopups({
  runtime,
  view,
  settings,
  on,
  popup,
  preferred = false
}: Options): () => void {
  const servers = frameServers()
  const self: Server = { preferred }
  const events = wordPopupEvents()
  const page = shownWordPopup()
  let pressed = false
  let known: Settings | null = null
  let showing: PagePopupPort | null = null
  let replaced: PagePopupPort | null = null
  let held: Held | null = null
  const ready = settings.ask().then(
    read => {
      known ??= read
    },
    () => undefined
  )
  const stopSettings = settings.onChanged(next => {
    known = next
  })
  const host = popup(() => known as Settings)

  const release = () => {
    const port = replaced
    replaced = null
    port?.disconnect()
  }

  const settle = () => {
    if (!pressed && !page.current) release()
  }
  const pressStarted = () => {
    pressed = true
  }
  const pressEnded = () => {
    pressed = false
    view.setTimeout(settle, 0)
  }

  const letGo = () => {
    const was = held
    held = null
    if (was && page.current === was.place) page.current = null
    return was
  }

  const closeHeld = () => {
    if (letGo()?.before) events.dispatchEvent(new Event('close'))
  }

  const hold = (port: PagePopupPort) => {
    const before = page.current?.handOver() ?? null
    release()
    const place: Place = {
      handOver: () => {
        letGo()
        replaced = port
        port.postMessage({ target: 'word-popup', replaced: true })
        return before
      }
    }
    held = { port, place, before }
    page.current = place
    port.postMessage({ target: 'word-popup', shown: true })
  }

  const show = (port: PagePopupPort, message: unknown) => {
    const request = shownRequest(message)
    if (!request || !known || !on(known)) return port.disconnect()
    if (request.inPanel) return hold(port)
    host.open({
      text: request.text,
      ids: request.ids,
      edge: { side: request.side, top: view.innerHeight - request.fromBottom },
      closed: (how: CardGone) => {
        if (showing !== port) return
        showing = null
        if (how === 'replaced' || pressed) replaced = port
        else port.disconnect()
      }
    })
    release()
    showing = port
    port.postMessage({ target: 'word-popup', shown: true })
  }

  const onConnect: Connected = port => {
    if (port.name !== pagePopupPort || answering(servers) !== self) return
    let alive = true
    port.onMessage.addListener(message => {
      ready.then(() => {
        if (alive) show(port, message)
      })
    })
    port.onDisconnect.addListener(() => {
      alive = false
      if (replaced === port) replaced = null
      if (held?.port === port) return closeHeld()
      if (showing !== port) return
      showing = null
      host.close()
    })
  }

  servers.push(self)
  events.addEventListener('close', settle)
  view.addEventListener('pointerdown', pressStarted, true)
  for (const type of pressEnds) view.addEventListener(type, pressEnded, true)
  runtime.onConnect.addListener(onConnect)
  return () => {
    const at = servers.indexOf(self)
    if (at >= 0) servers.splice(at, 1)
    events.removeEventListener('close', settle)
    view.removeEventListener('pointerdown', pressStarted, true)
    for (const type of pressEnds) view.removeEventListener(type, pressEnded, true)
    runtime.onConnect.removeListener(onConnect)
    stopSettings()
    if (showing) host.close()
    held?.port.disconnect()
    closeHeld()
    release()
  }
}
