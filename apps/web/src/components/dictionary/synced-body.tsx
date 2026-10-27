'use client'

import { Button } from '@zenbu/ui/components/button'
import Link from 'next/link'
import { type ReactNode, useMemo } from 'react'
import { FormMessage, Notice } from '@/components/account/form-message'
import { LogInButton } from '@/components/site-actions'
import { useSyncedItem } from '@/hooks/use-synced-item'
import { readsFor, type SyncedAction, subscriptionPage } from '@/lib/account/learner-items'
import type { SavedItem } from '@/lib/account/saved-item'
import { failedMessage } from '@/lib/account/synced-messages'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { SyncedKnown } from './synced-known'
import { SyncedLists } from './synced-lists'
import { SyncedNotes } from './synced-notes'
import type { LearnerText, SyncedPartProps } from './synced-props'

const parts = {
  markKnown: SyncedKnown,
  addToList: SyncedLists,
  addNote: SyncedNotes
} satisfies Record<SyncedAction, (props: SyncedPartProps) => ReactNode>

export function SyncedBody({
  action,
  service,
  item,
  locale,
  text,
  account
}: LearnerText & { action: SyncedAction; service: string; item: SavedItem; locale: Locale }) {
  const reads = useMemo(() => readsFor(action, item), [action, item])
  const synced = useSyncedItem({ service, reads, locale, text: account })
  const { view } = synced
  if (view.kind === 'loading') return <Notice>{account.synced.loading}</Notice>
  if (view.kind === 'signed-out') {
    return (
      <div className="flex flex-col gap-3">
        <p>{text.synced.signedOut}</p>
        <LogInButton locale={locale} label={text.signIn} className="self-start" />
      </div>
    )
  }
  if (view.kind === 'subscription-required') {
    return (
      <div className="flex flex-col gap-3">
        <p>{account.synced.needsSubscription}</p>
        <Button
          className="self-start"
          nativeButton={false}
          render={<Link href={localizedPath(subscriptionPage, locale)} />}
        >
          {account.synced.seeSubscription}
        </Button>
      </div>
    )
  }
  if (view.kind === 'failed') {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage problem={failedMessage(view.failure, account, locale)} />
        <Button type="button" variant="outline" className="self-start" onClick={synced.retry}>
          {text.synced.tryAgain}
        </Button>
      </div>
    )
  }
  const Part = parts[action]
  return (
    <div className="flex flex-col gap-4 pb-1">
      <Part
        copy={view.copy}
        item={item}
        synced={synced}
        locale={locale}
        text={text}
        account={account}
      />
      <FormMessage problem={synced.message} />
    </div>
  )
}
