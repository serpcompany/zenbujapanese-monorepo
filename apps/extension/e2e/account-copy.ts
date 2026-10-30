import type { Page, Request } from '@playwright/test'
import type { SyncedChange } from '@zenbu/account-rules/account-copy'
import type { CopyAnswer, CopyChange, CopyRequest, CopyView } from '../src/shared/account-copy.ts'
import { keptSessionToken } from './account-pages.ts'
import type { AccountService } from './account-service.ts'
import type { Extension } from './fixtures.ts'

export const word = { item: 'd12d09f1107aef0f7d43b54b62f0b7e1', headword: '要る', reading: 'いる' }

export const kanji = { item: 'kanji:要', headword: '要', reading: 'よう' }

const askCopy = (page: Page, request: CopyRequest): Promise<CopyAnswer> =>
  page.evaluate(
    copy => chrome.runtime.sendMessage({ target: 'service-worker', copy }),
    request
  ) as Promise<CopyAnswer>

async function viewOf(answering: Promise<CopyAnswer>): Promise<CopyView> {
  const answer = await answering
  if (answer.type !== 'copy') throw new Error(`The copy answered ${answer.type}.`)
  return answer.copy
}

export const readCopy = (page: Page) => viewOf(askCopy(page, { copy: 'read' }))

export const syncNow = (page: Page) => viewOf(askCopy(page, { copy: 'sync' }))

export const change = (page: Page, asked: CopyChange) =>
  askCopy(page, { copy: 'change', change: asked })

export const knownItems = (view: CopyView) => view.knownWords.map(known => known.item).sort()

type Synced = { results: { status: string }[]; changes: SyncedChange[] }

export async function onTheAccount(
  account: AccountService,
  extension: Extension,
  mutations: unknown[] = []
): Promise<Synced> {
  const sessionToken = await keptSessionToken(extension)
  const token = String((await account.call('/v1/auth/token', sessionToken)).body.token)
  const answer = await account.call('/v1/sync', token, 'POST', {
    cursor: null,
    limit: 500,
    mutations
  })
  if (answer.status !== 200) throw new Error(`POST /v1/sync answered ${answer.status}.`)
  return answer.body as Synced
}

export const knownOnTheAccount = (synced: Synced) =>
  synced.changes
    .filter(each => each.entity === 'knownWord' && each.data?.known === true)
    .map(each => each.entityId)
    .sort()

export function recordSyncs(extension: Extension) {
  const bodies: string[] = []
  const record = (request: Request) => {
    if (new URL(request.url()).pathname === '/v1/sync') bodies.push(request.postData() ?? '')
  }
  extension.context.on('request', record)
  return { bodies, stop: () => extension.context.off('request', record) }
}
