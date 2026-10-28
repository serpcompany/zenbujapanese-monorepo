import type { Locale } from '../i18n/config'
import { getDictionary } from '../i18n/dictionary'
import type { SyncedText } from './synced-messages'

export function syncedTextIn(locale: Locale): SyncedText {
  const { synced, messages } = getDictionary(locale).account
  return { synced, messages }
}
