import type { PanelPage, PanelRoute, PanelTab } from './route'

export type StackedPage = { key: number; page: PanelPage }

export type PanelState = {
  tab: PanelTab
  stacks: Record<PanelTab, StackedPage[]>
  nextKey: number
}

export function startState(tab: PanelTab): PanelState {
  return {
    tab,
    stacks: { translate: [], player: [], account: [] },
    nextKey: 0
  }
}

export function selectTab(state: PanelState, tab: PanelTab): PanelState {
  return tab === state.tab ? state : { ...state, tab }
}

const samePage = (one: PanelPage, other: PanelPage) => JSON.stringify(one) === JSON.stringify(other)

export function openPage(state: PanelState, page: PanelPage): PanelState {
  const stack = state.stacks[state.tab]
  const top = stack.at(-1)
  if (top && samePage(top.page, page)) return state
  return {
    ...state,
    stacks: { ...state.stacks, [state.tab]: [...stack, { key: state.nextKey, page }] },
    nextKey: state.nextKey + 1
  }
}

export function goBack(state: PanelState): PanelState {
  const stack = state.stacks[state.tab]
  if (stack.length === 0) return state
  return { ...state, stacks: { ...state.stacks, [state.tab]: stack.slice(0, -1) } }
}

export function goTo(state: PanelState, route: PanelRoute): PanelState {
  const onTab = route.tab ? selectTab(state, route.tab) : state
  return route.page ? openPage(onTab, route.page) : onTab
}
