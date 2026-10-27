export const panelTabs = ['video', 'translate', 'images', 'words', 'recent'] as const

export type PanelTab = (typeof panelTabs)[number]

export type PanelPage =
  | { page: 'word'; entSeq: number; entries?: number[] }
  | { page: 'kanji'; character: string }
  | { page: 'form'; form: string }
  | { page: 'test'; text: string }

export type PanelRoute = { tab?: PanelTab; page?: PanelPage }

export type OpenPanel = { target: 'service-worker'; openPanel: PanelRoute }

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
