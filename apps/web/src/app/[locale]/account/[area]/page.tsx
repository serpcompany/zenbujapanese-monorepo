import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AccountPageShell } from '@/components/account/account-page-shell'
import { SyncedAreaView } from '@/components/account/synced/synced-area'
import { accountMetadata } from '@/lib/account/metadata'
import { accountSettings } from '@/lib/account/settings'
import { syncedAreaAt } from '@/lib/account/synced'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

async function areaOf(params: PageProps<'/[locale]/account/[area]'>['params']) {
  const area = syncedAreaAt((await params).area)
  if (!area) notFound()
  return area
}

export async function generateMetadata({
  params
}: PageProps<'/[locale]/account/[area]'>): Promise<Metadata> {
  return accountMetadata(await areaOf(params), await localeOf(params))
}

export default async function SyncedAreaPage({
  params,
  searchParams
}: PageProps<'/[locale]/account/[area]'>) {
  const area = await areaOf(params)
  const locale = await localeOf(params)
  const list = (await searchParams).list
  return (
    <AccountPageShell page={area} locale={locale} settings={await accountSettings()}>
      {settings => (
        <SyncedAreaView
          area={area}
          locale={locale}
          text={getDictionary(locale).account}
          settings={settings}
          listId={area === 'lists' && typeof list === 'string' ? list : null}
        />
      )}
    </AccountPageShell>
  )
}
