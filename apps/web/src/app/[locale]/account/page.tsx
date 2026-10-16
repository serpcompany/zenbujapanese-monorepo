import type { Metadata } from 'next'
import { AccountPageShell } from '@/components/account/account-page-shell'
import { AccountView } from '@/components/account/account-view'
import { accountMetadata } from '@/lib/account/metadata'
import { returnedError } from '@/lib/account/pages'
import { accountSettings } from '@/lib/account/settings'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params
}: PageProps<'/[locale]/account'>): Promise<Metadata> {
  return accountMetadata('account', await localeOf(params))
}

export default async function AccountPage({
  params,
  searchParams
}: PageProps<'/[locale]/account'>) {
  const locale = await localeOf(params)
  const error = returnedError(await searchParams)
  return (
    <AccountPageShell page="account" locale={locale} settings={await accountSettings()}>
      {settings => (
        <AccountView
          locale={locale}
          text={getDictionary(locale).account}
          settings={settings}
          returnedError={error}
        />
      )}
    </AccountPageShell>
  )
}
