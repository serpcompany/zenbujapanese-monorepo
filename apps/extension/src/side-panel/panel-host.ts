import { clearPendingRoute, readLastTab, readPendingRoute, saveLastTab } from './panel-storage'
import { type PanelRoute, type PanelTab, routeForWindow } from './route'

export type PanelHost = {
  windowId(): Promise<number>
  readLastTab(): Promise<PanelTab>
  saveLastTab(tab: PanelTab): void
  readRoute(windowId: number): Promise<PanelRoute | null>
  clearRoute(windowId: number): void
  watchRoutes(windowId: number, listener: (route: PanelRoute) => void): () => void
  openSettings(): void
}

const noWindow = -1

function watchRoutes(windowId: number, listener: (route: PanelRoute) => void): () => void {
  const onMessage = (message: unknown) => {
    const route = routeForWindow(windowId, message)
    if (route) listener(route)
    return false
  }
  chrome.runtime.onMessage.addListener(onMessage)
  return () => chrome.runtime.onMessage.removeListener(onMessage)
}

export const chromePanelHost: PanelHost = {
  windowId: () =>
    chrome.windows.getCurrent().then(
      window => window.id ?? noWindow,
      () => noWindow
    ),
  readLastTab,
  saveLastTab: tab => {
    saveLastTab(tab)
  },
  readRoute: readPendingRoute,
  clearRoute: windowId => {
    clearPendingRoute(windowId)
  },
  watchRoutes,
  openSettings: () => {
    chrome.runtime.openOptionsPage().catch(() => undefined)
  }
}
