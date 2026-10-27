import { useCallback, useEffect, useState } from 'react'
import { goBack, goTo, openPage, type PanelState, selectTab, startState } from './navigation'
import type { PanelHost } from './panel-host'
import type { PanelPage, PanelRoute, PanelTab } from './route'

function followRoutes(
  host: PanelHost,
  restore: (state: PanelState) => void,
  move: (route: PanelRoute) => void
) {
  let stopped = false
  let early: PanelRoute[] | null = []
  let stopWatching: () => void = () => undefined
  const arrive = (route: PanelRoute) => (early ? early.push(route) : move(route))
  host.windowId().then(windowId => {
    if (stopped) return
    stopWatching = host.watchRoutes(windowId, route => {
      host.clearRoute(windowId)
      arrive(route)
    })
    return Promise.all([host.readLastTab(), host.readRoute(windowId)]).then(([lastTab, route]) => {
      if (stopped) return
      if (route) host.clearRoute(windowId)
      const waiting = [...(route ? [route] : []), ...(early ?? [])]
      early = null
      restore(waiting.reduce(goTo, startState(lastTab)))
    })
  })
  return () => {
    stopped = true
    stopWatching()
  }
}

export function usePanelNavigation(host: PanelHost) {
  const [state, setState] = useState<PanelState | null>(null)

  useEffect(
    () =>
      followRoutes(host, setState, route => setState(current => current && goTo(current, route))),
    [host]
  )

  const tab = state?.tab
  useEffect(() => {
    if (tab) host.saveLastTab(tab)
  }, [host, tab])

  const select = useCallback(
    (next: PanelTab) => setState(current => current && selectTab(current, next)),
    []
  )
  const open = useCallback(
    (page: PanelPage) => setState(current => current && openPage(current, page)),
    []
  )
  const back = useCallback(() => setState(current => current && goBack(current)), [])

  return { state, select, open, back }
}
