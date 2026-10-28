import type { SyncedItem } from '@/hooks/use-synced-item'
import type { SavedItem } from '@/lib/account/saved-item'
import type { SyncedCopy } from '@/lib/account/synced'
import type { SyncedText } from '@/lib/account/synced-messages'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'

export interface LearnerText {
  text: Dictionary['learner']
  account: SyncedText
}

export interface SyncedPartProps extends LearnerText {
  copy: SyncedCopy
  item: SavedItem
  synced: SyncedItem
  locale: Locale
}
