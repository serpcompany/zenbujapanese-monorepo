import type { PageSettings, Settings } from '../shared/settings'
import { type PagePopupPort, pagePopupPort, shownRequest } from './page-popup'
import type { PopupHost } from './popup-host'

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
}

export function servePagePopups({ runtime, view, settings, on, popup }: Options): () => void {
  let known: Settings | null = null
  let showing: PagePopupPort | null = null
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

  const show = (port: PagePopupPort, message: unknown) => {
    const request = shownRequest(message)
    if (!request || !known || !on(known)) return port.disconnect()
    host.open({
      text: request.text,
      ids: request.ids,
      edge: { side: request.side, top: view.innerHeight - request.fromBottom },
      closed: () => {
        if (showing !== port) return
        showing = null
        port.disconnect()
      }
    })
    showing = port
    port.postMessage({ target: 'word-popup', shown: true })
  }

  const onConnect: Connected = port => {
    if (port.name !== pagePopupPort) return
    let alive = true
    port.onMessage.addListener(message => {
      ready.then(() => {
        if (alive) show(port, message)
      })
    })
    port.onDisconnect.addListener(() => {
      alive = false
      if (showing !== port) return
      showing = null
      host.close()
    })
  }

  runtime.onConnect.addListener(onConnect)
  return () => {
    runtime.onConnect.removeListener(onConnect)
    stopSettings()
    if (showing) host.close()
  }
}
