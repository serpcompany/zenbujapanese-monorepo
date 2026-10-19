import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { type Crumb, DictionaryBreadcrumbs } from './dictionary-breadcrumbs'
import { SavedItemActions } from './saved-item-actions'

export function PageToolbar({
  page,
  shareText,
  locale
}: {
  page: Crumb
  shareText: string
  locale: Locale
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <DictionaryBreadcrumbs locale={locale} page={page} />
      </div>
      <SavedItemActions
        title={page.label}
        shareText={shareText}
        locale={locale}
        text={getDictionary(locale).learner}
      />
    </div>
  )
}
