import { BookMarked, CircleUserRound } from 'lucide-react'
import { EmptyState, SignUpButton } from './empty-tab'
import { labels } from './labels'

export function AccountTab() {
  return (
    <div className="flex flex-col">
      <section data-account="signed-out">
        <EmptyState icon={CircleUserRound} text={labels.empty.account}>
          <SignUpButton />
        </EmptyState>
      </section>
      <section data-profile="words" className="border-t">
        <EmptyState icon={BookMarked} text={labels.empty.words} />
      </section>
    </div>
  )
}
