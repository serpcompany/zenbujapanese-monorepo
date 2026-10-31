import { Button } from '@zenbu/ui/components/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@zenbu/ui/components/item'
import { CircleUserRound, CreditCard, LogOut, UserPen } from 'lucide-react'
import { useState } from 'react'
import { type Account, accountPage, askAccount } from '../shared/account'
import { EmptyState } from '../side-panel/empty-tab'
import { DeleteAccount, type Deleted } from './delete-account'
import { accountLabels } from './labels'
import { SignInWays } from './sign-in-ways'
import { subscriptionView } from './subscription'
import { UnsyncedWarning } from './unsynced-warning'
import { useAccount } from './use-account'

type SignedIn = Extract<Account, { signedIn: true }>

function AccountLink({ label, onOpen }: { label: string; onOpen?: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={
        <a href={accountPage} target="_blank" rel="noreferrer" onClick={onOpen}>
          {label}
        </a>
      }
    />
  )
}

type SignedInProps = {
  account: SignedIn
  className?: string
  onDeleted: (deleted: Deleted) => void
}

function SignedInAccount({ account, className, onDeleted }: SignedInProps) {
  const subscription = subscriptionView(account.subscription)
  const [busy, setBusy] = useState(false)
  const wentToSubscribe = () => void askAccount({ account: 'went-to-subscribe' })
  async function signOut() {
    setBusy(true)
    await askAccount({ account: 'sign-out' })
    setBusy(false)
  }
  return (
    <section data-account="signed-in" className={`flex flex-col gap-4 ${className ?? ''}`}>
      <ItemGroup>
        <Item variant="outline">
          <ItemMedia variant="icon">
            <CircleUserRound />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle data-account-email className="w-full truncate">
              {account.email}
            </ItemTitle>
          </ItemContent>
        </Item>
        <Item variant="outline" data-subscription={subscription.action ?? 'none'}>
          <ItemMedia variant="icon">
            <CreditCard />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{accountLabels.subscription.heading}</ItemTitle>
            <ItemDescription className="line-clamp-none" data-subscription-state>
              {subscription.line}
            </ItemDescription>
            {subscription.detail && (
              <ItemDescription className="line-clamp-none">{subscription.detail}</ItemDescription>
            )}
          </ItemContent>
          {subscription.action && (
            <ItemActions>
              <AccountLink
                label={
                  subscription.action === 'subscribe'
                    ? accountLabels.subscription.subscribe
                    : accountLabels.subscription.manage
                }
                onOpen={wentToSubscribe}
              />
            </ItemActions>
          )}
        </Item>
        <Item variant="outline">
          <ItemMedia variant="icon">
            <UserPen />
          </ItemMedia>
          <ItemContent>
            <ItemDescription className="line-clamp-none">
              {accountLabels.manageAccountDetail}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <AccountLink label={accountLabels.manageAccount} />
          </ItemActions>
        </Item>
        <Item variant="outline">
          <ItemMedia variant="icon">
            <LogOut />
          </ItemMedia>
          <ItemContent>
            <ItemDescription className="line-clamp-none">
              {accountLabels.signOutDetail}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" disabled={busy} onClick={signOut}>
              {accountLabels.signOut}
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
      <div className="flex">
        <DeleteAccount
          email={account.email}
          subscription={account.subscription}
          onDeleted={onDeleted}
        />
      </div>
    </section>
  )
}

function DeletedNotice({ deleted }: { deleted: Deleted }) {
  return (
    <output data-account-deleted className="block text-sm">
      {accountLabels.deletion.deleted}
      {deleted.appStoreSubscriptionContinues && ` ${accountLabels.deletion.appStoreStillBills}`}
    </output>
  )
}

export function AccountShown({ account, className }: { account: Account; className?: string }) {
  const [deleted, setDeleted] = useState<Deleted | null>(null)
  if (account.signedIn) {
    return <SignedInAccount account={account} className={className} onDeleted={setDeleted} />
  }
  return (
    <section data-account="signed-out" className={className}>
      <EmptyState icon={CircleUserRound} text={accountLabels.signedOut} className="p-0">
        {deleted && <DeletedNotice deleted={deleted} />}
        <UnsyncedWarning />
        <SignInWays purpose="sign-in" />
      </EmptyState>
    </section>
  )
}

export function AccountView({ className }: { className?: string }) {
  const account = useAccount()
  return account && <AccountShown account={account} className={className} />
}
