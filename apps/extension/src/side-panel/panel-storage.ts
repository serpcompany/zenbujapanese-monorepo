import { isPanelRoute, isPanelTab, type PanelRoute, type PanelTab } from './route'

const lastTabKey = 'sidePanel.lastTab'

const firstTab: PanelTab = 'video'

const routeKey = (windowId: number) => `sidePanel.route.${windowId}`

const ignoreFailure = () => undefined

export function readLastTab(): Promise<PanelTab> {
  return chrome.storage.local.get(lastTabKey).then(
    items => (isPanelTab(items[lastTabKey]) ? items[lastTabKey] : firstTab),
    () => firstTab
  )
}

export function saveLastTab(tab: PanelTab): Promise<void> {
  return chrome.storage.local.set({ [lastTabKey]: tab }).catch(ignoreFailure)
}

export function savePendingRoute(windowId: number, route: PanelRoute): Promise<void> {
  return chrome.storage.session.set({ [routeKey(windowId)]: route }).catch(ignoreFailure)
}

export function readPendingRoute(windowId: number): Promise<PanelRoute | null> {
  const key = routeKey(windowId)
  return chrome.storage.session.get(key).then(
    items => (isPanelRoute(items[key]) ? items[key] : null),
    () => null
  )
}

export function clearPendingRoute(windowId: number): Promise<void> {
  return chrome.storage.session.remove(routeKey(windowId)).catch(ignoreFailure)
}
