type SiteRequest = { target: 'content-script'; site: 'read' }

type SiteAnswer = { host: string }

type Listener = (
  message: unknown,
  sender: unknown,
  respond: (answer: SiteAnswer) => void
) => boolean

type MessageEvents = {
  addListener(listener: Listener): void
  removeListener(listener: Listener): void
}

type TabSender = {
  sendMessage(tabId: number, message: SiteRequest, options: { frameId: number }): Promise<unknown>
}

const siteRequest: SiteRequest = { target: 'content-script', site: 'read' }

const topFrame = { frameId: 0 }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isSiteRequest = (message: unknown): message is SiteRequest =>
  isRecord(message) && message.target === siteRequest.target && message.site === siteRequest.site

export function answerSiteRequests(
  host: string = location.hostname,
  events: MessageEvents = chrome.runtime.onMessage
): () => void {
  const answer: Listener = (message, _sender, respond) => {
    if (!isSiteRequest(message)) return false
    respond({ host })
    return true
  }
  events.addListener(answer)
  return () => events.removeListener(answer)
}

export function askPageHost(tabId: number, tabs: TabSender = chrome.tabs): Promise<string | null> {
  return Promise.resolve()
    .then(() => tabs.sendMessage(tabId, siteRequest, topFrame))
    .then(
      answer => (isRecord(answer) && typeof answer.host === 'string' && answer.host) || null,
      () => null
    )
}
