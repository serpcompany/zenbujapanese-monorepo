import { type Failure, failure } from '../shared/messages'
import {
  fittingChanges,
  isSettingsRequest,
  isSettingsWrite,
  readSettings,
  type Settings,
  settingsChanged,
  watchSettings,
  writeSettings
} from '../shared/settings'

type Tabs = {
  query(filter: Record<string, never>): Promise<{ id?: number }[]>
  sendMessage(tabId: number, message: ReturnType<typeof settingsChanged>): Promise<unknown>
}

type Written = { type: 'written' }

type Sender = { origin?: string }

const pageWritable: ReadonlySet<string> = new Set(['videos.captionPlace'])

function changesFrom(changes: Record<string, unknown>, fromPages: boolean): Partial<Settings> {
  const refused = Object.keys(changes).filter(key => !pageWritable.has(key))
  if (!fromPages && refused.length > 0) {
    throw new Error(`A content script may not write ${refused.join(', ')}.`)
  }
  return fittingChanges(changes)
}

export function answerSettings(
  pagesOrigin: string,
  read: () => Promise<Settings> = readSettings,
  write: (changes: Partial<Settings>) => Promise<void> = writeSettings
) {
  return (
    message: unknown,
    sender: Sender,
    sendResponse: (answer: Settings | Written | Failure) => void
  ): boolean => {
    if (isSettingsWrite(message)) {
      Promise.resolve()
        .then(() => write(changesFrom(message.changes, sender.origin === pagesOrigin)))
        .then(
          () => sendResponse({ type: 'written' }),
          (error: unknown) => sendResponse(failure(error))
        )
      return true
    }
    if (!isSettingsRequest(message)) return false
    Promise.resolve()
      .then(() => read())
      .then(sendResponse, (error: unknown) => sendResponse(failure(error)))
    return true
  }
}

export function tellOpenTabs(tabs: Tabs) {
  return (settings: Settings): Promise<void> =>
    tabs
      .query({})
      .then(open =>
        Promise.all(
          open.map(({ id }) =>
            id === undefined
              ? undefined
              : tabs.sendMessage(id, settingsChanged(settings)).catch(() => undefined)
          )
        )
      )
      .then(
        () => undefined,
        () => undefined
      )
}

export function startSettingsChannel(extensionId: string): void {
  chrome.runtime.onMessage.addListener(answerSettings(`chrome-extension://${extensionId}`))
  watchSettings(tellOpenTabs(chrome.tabs))
}
