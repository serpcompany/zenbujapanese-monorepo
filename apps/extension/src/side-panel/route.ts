const panelTabs = ['video', 'translate', 'images', 'words', 'recent'] as const

type PanelTab = (typeof panelTabs)[number]

type PanelPage =
  | { page: 'word'; entSeq: number; entries?: number[] }
  | { page: 'kanji'; character: string }
  | { page: 'form'; form: string }
  | { page: 'test'; text: string }

export type PanelRoute = { tab?: PanelTab; page?: PanelPage }

type OpenPanel = { target: 'service-worker'; openPanel: PanelRoute }

type Sender = { sendMessage(message: OpenPanel): Promise<unknown> }

export function openPanel(route: PanelRoute, sender: Sender = chrome.runtime): Promise<void> {
  return sender.sendMessage({ target: 'service-worker', openPanel: route }).then(
    () => undefined,
    () => undefined
  )
}
