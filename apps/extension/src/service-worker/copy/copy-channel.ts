import {
  type CopyAnswer,
  type CopyChanged,
  type CopyRequest,
  isCopyEnvelope,
  type KnownChanged,
  type SavingRefusal,
  type SavingRefused
} from '../../shared/account-copy'
import { failure } from '../../shared/messages'
import type { AccountCopy, TellSender } from './copy-service'
import type { CopyFailure } from './sync'

export type Sender = { origin?: string; url?: string; tab?: { id?: number } }

type Told = KnownChanged | SavingRefused | CopyChanged

type Tabs = {
  query(filter: Record<string, never>): Promise<{ id?: number }[]>
  sendMessage(tabId: number, message: Told): Promise<unknown>
}

type Pages = { sendMessage(message: Told): Promise<unknown> }

const isItemList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

const aboutWords = (request: CopyRequest) =>
  request.copy === 'known' || request.copy === 'word' || request.copy === 'word-change'

const wellFormed = (request: CopyRequest) => {
  if (request.copy === 'known') return isItemList(request.items)
  return !aboutWords(request) || typeof (request as { item?: unknown }).item === 'string'
}

export function answerCopy(
  copy: AccountCopy,
  reportFailure: (code: CopyFailure) => void,
  pagesOrigin: string,
  tellSender: (sender: Sender) => TellSender
) {
  return (message: unknown, sender: Sender, respond: (answer: CopyAnswer) => void): boolean => {
    if (!isCopyEnvelope(message)) return false
    const request = message.copy
    if (!wellFormed(request)) return false
    if (sender.origin !== pagesOrigin && !aboutWords(request)) return false
    copy.answer(request, tellSender(sender)).then(respond, (error: unknown) => {
      reportFailure('account-copy')
      respond(failure(error))
    })
    return true
  }
}

export function telling(tabs: Tabs, pages: Pages) {
  const toTab = (id: number, told: Told) => tabs.sendMessage(id, told).catch(() => undefined)
  const toPages = (told: Told) => void pages.sendMessage(told).catch(() => undefined)
  const everyone = (told: Told): void => {
    toPages(told)
    void tabs
      .query({})
      .then(open =>
        Promise.all(open.map(({ id }) => (id === undefined ? undefined : toTab(id, told))))
      )
      .catch(() => undefined)
  }
  const sender =
    ({ url, tab }: Sender): TellSender =>
    (refusal: SavingRefusal) => {
      const told: SavingRefused = { target: 'saving', refusal, page: url }
      if (tab?.id === undefined) toPages(told)
      else void toTab(tab.id, told)
    }
  return { everyone, sender, pages: toPages }
}
