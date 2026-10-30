import { BookMarked } from 'lucide-react'
import { AccountView } from '../account/account-view'
import { EmptyState } from './empty-tab'
import { labels } from './labels'

export function AccountTab() {
  return (
    <div className="flex flex-col">
      <AccountView className="p-4" />
      <section data-profile="words" className="border-t">
        <EmptyState icon={BookMarked} text={labels.empty.words} />
      </section>
    </div>
  )
}
