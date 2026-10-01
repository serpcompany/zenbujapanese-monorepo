import { SavedItemActions } from './saved-item-actions'

export function PageToolbar({ title, shareText }: { title: string; shareText: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h1 lang="ja" className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <SavedItemActions title={title} shareText={shareText} />
    </div>
  )
}
