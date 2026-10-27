export const panelTabs = ['video', 'translate', 'images', 'words', 'recent'] as const

export type PanelTab = (typeof panelTabs)[number]

export type PanelPage =
  | { page: 'word'; entSeq: number; entries?: number[] }
  | { page: 'kanji'; character: string }
  | { page: 'form'; form: string }
  | { page: 'test'; text: string }

export type PanelRoute = { tab?: PanelTab; page?: PanelPage }

export type OpenPanel = { target: 'service-worker'; openPanel: PanelRoute }

export type MovePanel = { target: 'side-panel'; windowId: number; route: PanelRoute }

export type PanelTabProps = { open(page: PanelPage): void }

export type PanelPageProps<P extends PanelPage = PanelPage> = {
  page: P
  open(page: PanelPage): void
}

type Sender = { sendMessage(message: OpenPanel): Promise<unknown> }

export function openPanel(route: PanelRoute, sender: Sender = chrome.runtime): Promise<void> {
  return sender.sendMessage({ target: 'service-worker', openPanel: route }).then(
    () => undefined,
    () => undefined
  )
}

type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null

const isEntSeqList = (value: unknown) =>
  value === undefined || (Array.isArray(value) && value.every(Number.isSafeInteger))

const isTestBuild = () => import.meta.env.MODE === 'test'

const pageShapes: { [K in PanelPage['page']]: (page: Fields) => boolean } = {
  word: page => Number.isSafeInteger(page.entSeq) && isEntSeqList(page.entries),
  kanji: page => typeof page.character === 'string',
  form: page => typeof page.form === 'string',
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
