import type { Locale } from '../i18n/config'
import { accessTokens } from './access-tokens'
import { accountApi } from './client'
import { syncedService } from './learner-items'
import { syncedCopy } from './synced'

const bytesOf = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], pair => Number.parseInt(pair, 16))

export async function searchIdOf(searchKey: string, query: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    bytesOf(searchKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(query.normalize('NFC'))
  )
  return Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function recordSearch(query: string, locale: Locale, now = new Date()) {
  const service = syncedService()
  if (!service || query === '') return
  const api = accountApi(service, locale)
  const tokens = accessTokens(api)
  const session = await api.session()
  if (!session.ok || session.value === null) return
  tokens.belongTo(session.value.userId)
  const searchKey = await tokens.use(token => api.searchKey(token))
  if (!searchKey.ok) return
  const fields = { query, searchedAt: now.toISOString() }
  const id = await searchIdOf(searchKey.value, query)
  await syncedCopy(api, tokens).change('recentSearch', 'search', id, fields, null)
}
