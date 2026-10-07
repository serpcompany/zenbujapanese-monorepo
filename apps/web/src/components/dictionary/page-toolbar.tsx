import { type Crumb, DictionaryBreadcrumbs } from './dictionary-breadcrumbs'
import { SavedItemActions } from './saved-item-actions'

export function PageToolbar({ page, shareText }: { page: Crumb; shareText: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <DictionaryBreadcrumbs page={page} />
      </div>
      <SavedItemActions title={page.label} shareText={shareText} />
    </div>
  )
}
