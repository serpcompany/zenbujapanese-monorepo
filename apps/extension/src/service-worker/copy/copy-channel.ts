import { type CopyAnswer, isCopyEnvelope, type KnownChanged } from '../../shared/account-copy'
import { failure } from '../../shared/messages'
import type { AccountCopy } from './copy-service'
import type { CopyFailure } from './sync'

type Sender = { origin?: string }

type Tabs = {
  query(filter: Record<string, never>): Promise<{ id?: number }[]>
  sendMessage(tabId: number, message: KnownChanged): Promise<unknown>
}

type Pages = { sendMessage(message: KnownChanged): Promise<unknown> }

const isItemList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

export function answerCopy(
  copy: AccountCopy,
  reportFailure: (code: CopyFailure) => void,
  pagesOrigin: string
) {
  return (message: unknown, sender: Sender, respond: (answer: CopyAnswer) => void): boolean => {
    if (!isCopyEnvelope(message)) return false
    const request = message.copy
    if (request.copy === 'known' && !isItemList(request.items)) return false
    if (sender.origin !== pagesOrigin && request.copy !== 'known') return false
    copy.answer(request).then(respond, (error: unknown) => {
      reportFailure('account-copy')
      respond(failure(error))
    })
    return true
  }
}

export function tellKnown(tabs: Tabs, pages: Pages) {
  return (changed: KnownChanged): void => {
    void pages.sendMessage(changed).catch(() => undefined)
    void tabs
      .query({})
      .then(open =>
        Promise.all(
          open.map(({ id }) =>
            id === undefined ? undefined : tabs.sendMessage(id, changed).catch(() => undefined)
          )
        )
      )
      .catch(() => undefined)
  }
}
