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

export function answerSettings(
  read: () => Promise<Settings> = readSettings,
  write: (changes: Partial<Settings>) => Promise<void> = writeSettings
) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (answer: Settings | Written | Failure) => void
  ): boolean => {
    if (isSettingsWrite(message)) {
      Promise.resolve()
        .then(() => write(fittingChanges(message.changes)))
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

export function startSettingsChannel(): void {
  chrome.runtime.onMessage.addListener(answerSettings())
  watchSettings(tellOpenTabs(chrome.tabs))
}
