import type { Metadata } from 'next'
import { AccountPageShell } from '@/components/account/account-page-shell'
import { ExtensionSignIn } from '@/components/account/extension-sign-in'
import { accountMetadata } from '@/lib/account/metadata'
import { returnedError } from '@/lib/account/pages'
import { accountSettings } from '@/lib/account/settings'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params
}: PageProps<'/[locale]/account/extension'>): Promise<Metadata> {
  return accountMetadata('extension', await localeOf(params))
}

export default async function ExtensionPage({
  params,
  searchParams
}: PageProps<'/[locale]/account/extension'>) {
  const locale = await localeOf(params)
  const error = returnedError(await searchParams)
  return (
    <AccountPageShell page="extension" locale={locale} settings={await accountSettings()}>
      {settings => (
        <ExtensionSignIn
          locale={locale}
          text={getDictionary(locale).account}
          settings={settings}
          returnedError={error}
        />
      )}
    </AccountPageShell>
  )
}
