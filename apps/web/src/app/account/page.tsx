import { AccountPageShell, AccountUnavailable } from '@/components/account/account-page-shell'
import { AccountView } from '@/components/account/account-view'
import { accountMetadata, accountPages, returnedError } from '@/lib/account/pages'
import { accountSettings } from '@/lib/account/settings'

export const dynamic = 'force-dynamic'

export const metadata = accountMetadata('account')

export default async function AccountPage({ searchParams }: PageProps<'/account'>) {
  const settings = await accountSettings()
  return (
    <AccountPageShell
      title={accountPages.account.title}
      intro="Your Zenbu account works in the Zenbu Japanese app and on this site."
    >
      {settings ? (
        <AccountView settings={settings} returnedError={returnedError(await searchParams)} />
      ) : (
        <AccountUnavailable />
      )}
    </AccountPageShell>
  )
}
