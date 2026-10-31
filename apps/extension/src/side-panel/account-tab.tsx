import { BookMarked } from 'lucide-react'
import { AccountShown } from '../account/account-view'
import { useAccount } from '../account/use-account'
import { SavedWords } from '../saved-words/saved-words'
import { EmptyState } from './empty-tab'
import { labels } from './labels'
import type { PanelTabProps } from './route'

export function AccountTab({ open }: PanelTabProps) {
  const account = useAccount()
  if (account === null) return null
  return (
    <div className="flex flex-col">
      <AccountShown account={account} className="p-4" />
      {account.signedIn ? (
        <SavedWords open={open} />
      ) : (
        <section data-profile="words" className="border-t">
          <EmptyState icon={BookMarked} text={labels.empty.words} />
        </section>
      )}
    </div>
  )
}
