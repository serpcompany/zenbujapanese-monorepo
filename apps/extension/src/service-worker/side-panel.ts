import { type Failure, failure } from '../shared/messages'
import { clearPendingRoute, savePendingRoute } from '../side-panel/panel-storage'
import {
  isOpenPanelMessage,
  isPanelRoute,
  type MovePanel,
  type PanelRoute
} from '../side-panel/route'

type PanelOpened = { type: 'opened' }

export type PanelWindows = {
  open(windowId: number | null): Promise<void>
  focusedWindowId(): Promise<number>
  saveRoute(windowId: number, route: PanelRoute): Promise<void>
  clearRoute(windowId: number): Promise<void>
  tellPanel(message: MovePanel): Promise<unknown>
}

type Sender = { tab?: { windowId: number } }

type Respond = (answer: PanelOpened | Failure) => void

const notARoute: Failure = { type: 'failed', reason: 'That is not a side panel route.' }

const panelOpened: PanelOpened = { type: 'opened' }

function handOver(windows: PanelWindows, windowId: number, route: PanelRoute) {
  return windows
    .saveRoute(windowId, route)
    .then(() => windows.tellPanel({ target: 'side-panel', windowId, route }))
}

export function openPanelListener(windows: PanelWindows) {
  return (message: unknown, sender: Sender, respond: Respond): boolean => {
    if (!isOpenPanelMessage(message)) return false
    const route = message.openPanel
    if (!isPanelRoute(route)) {
      respond(notARoute)
      return false
    }
    const opened = windows.open(sender.tab?.windowId ?? null).then(() => null, failure)
    const windowId = sender.tab ? Promise.resolve(sender.tab.windowId) : windows.focusedWindowId()
    windowId
      .then(id =>
        handOver(windows, id, route)
          .then(() => opened)
          .then(problem => problem && windows.clearRoute(id).then(() => problem))
      )
      .then(
        problem => respond(problem ?? panelOpened),
        (error: unknown) => respond(failure(error))
      )
    return true
  }
}

export function startSidePanel(): void {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  chrome.runtime.onMessage.addListener(
    openPanelListener({
      open: windowId =>
        chrome.sidePanel.open({ windowId: windowId ?? chrome.windows.WINDOW_ID_CURRENT }),
      focusedWindowId: () =>
        chrome.windows.getLastFocused().then(window => window.id ?? chrome.windows.WINDOW_ID_NONE),
      saveRoute: savePendingRoute,
      clearRoute: clearPendingRoute,
      tellPanel: message => chrome.runtime.sendMessage(message).catch(() => undefined)
    })
  )
}
