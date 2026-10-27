import Link from 'next/link'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Subscription } from '@/lib/account/answers'
import type { AccountText } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import { syncedAreaNames } from '@/lib/account/synced'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'

export function SyncedDataSection({
  subscription,
  locale,
  text
}: {
  subscription: Subscription | null
  locale: Locale
  text: AccountText
}) {
  const words = text.synced
  const needsOne = subscription?.cloudAccess === 'subscription_required'
  return (
    <section aria-labelledby="synced-data" className="flex flex-col gap-3">
      <h2 id="synced-data" className="text-lg font-medium">
        {words.heading}
      </h2>
      <p className="text-sm text-muted-foreground">{words.hubIntro}</p>
      {needsOne ? (
        <p className="text-sm">
          {words.needsSubscription} <a href="#subscription">{words.seeSubscription}</a>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {syncedAreaNames.map(area => (
            <Item
              key={area}
              variant="outline"
              render={<Link href={localizedPath(accountPages[area].path, locale)} />}
            >
              <ItemContent>
                <ItemTitle>{text.pages[area].title}</ItemTitle>
                <ItemDescription>{text.pages[area].description}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </div>
      )}
    </section>
  )
}
