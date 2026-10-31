export const panelTabs = ['player', 'translate', 'account'] as const

export type PanelTab = (typeof panelTabs)[number]

export type PanelPage =
  | { page: 'image-search' }
  | { page: 'known-words' }
  | { page: 'learning' }
  | { page: 'lists' }
  | { page: 'list'; list: string }
  | { page: 'notes' }
  | { page: 'test'; text: string }

export type PanelRoute = { tab?: PanelTab; page?: PanelPage }

export type MovePanel = { target: 'side-panel'; windowId: number; route: PanelRoute }

export type PanelTabProps = {
  open(page: PanelPage): void
  select?(tab: PanelTab): void
  shown?: boolean
}

export type PanelPageProps<P extends PanelPage = PanelPage> = {
  page: P
  open(page: PanelPage): void
}

type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null

const isTestBuild = () => import.meta.env.MODE === 'test'

const pageShapes: { [K in PanelPage['page']]: (page: Fields) => boolean } = {
  'image-search': () => true,
  'known-words': () => true,
  learning: () => true,
  lists: () => true,
  list: page => typeof page.list === 'string',
  notes: () => true,
  test: page => isTestBuild() && typeof page.text === 'string'
}

const isPageKind = (value: unknown): value is PanelPage['page'] =>
  typeof value === 'string' && Object.hasOwn(pageShapes, value)

export function isPanelTab(value: unknown): value is PanelTab {
  return panelTabs.some(tab => tab === value)
}

function isPanelPage(value: unknown): value is PanelPage {
  return isFields(value) && isPageKind(value.page) && pageShapes[value.page](value)
}

export function isPanelRoute(value: unknown): value is PanelRoute {
  return (
    isFields(value) &&
    (value.tab === undefined || isPanelTab(value.tab)) &&
    (value.page === undefined || isPanelPage(value.page))
  )
}

export function isOpenPanelMessage(message: unknown): message is { openPanel: unknown } {
  return isFields(message) && message.target === 'service-worker' && 'openPanel' in message
}

export function routeForWindow(windowId: number, message: unknown): PanelRoute | null {
  if (!isFields(message) || message.target !== 'side-panel' || message.windowId !== windowId) {
    return null
  }
  return isPanelRoute(message.route) ? message.route : null
}
