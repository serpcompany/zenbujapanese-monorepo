import { syncedTextIn } from '@/lib/account/learner-text'
import type { SavedItem } from '@/lib/account/saved-item'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { type Crumb, DictionaryBreadcrumbs } from './dictionary-breadcrumbs'
import { SiteItemActions } from './site-item-actions'

export function PageToolbar({
  page,
  shareText,
  item,
  locale
}: {
  page: Crumb
  shareText: string
  item: SavedItem
  locale: Locale
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <DictionaryBreadcrumbs locale={locale} page={page} />
      </div>
      <SiteItemActions
        title={page.label}
        shareText={shareText}
        item={item}
        locale={locale}
        text={getDictionary(locale).learner}
        account={syncedTextIn(locale)}
      />
    </div>
  )
}
