import { Fill } from '@zenbu/ui/lib/fill'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { type AccountPage, accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'

export function AccountPageShell({
  page,
  locale,
  settings,
  children
}: {
  page: AccountPage
  locale: Locale
  settings: AccountSettings | null
  children: (settings: AccountSettings) => ReactNode
}) {
  const text = getDictionary(locale).account
  const { title, intro } = text.pages[page]
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 [&_a]:underline">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {settings ? <div className="text-muted-foreground">{intro}</div> : null}
      </div>
      {settings ? children(settings) : <output className="block">{text.unavailable}</output>}
    </main>
  )
}

export function OtherAccountPages({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 text-sm text-muted-foreground">{children}</div>
}

export function AccountPageLink({
  page,
  locale,
  children
}: {
  page: AccountPage
  locale: Locale
  children: ReactNode
}) {
  return <Link href={localizedPath(accountPages[page].path, locale)}>{children}</Link>
}

export function LinkedLine({
  template,
  values
}: {
  template: string
  values: Readonly<Record<string, ReactNode>>
}) {
  return (
    <p>
      <Fill template={template} values={values} />
    </p>
  )
}

export function CantSignIn({ locale }: { locale: Locale }) {
  return (
    <p>
      <AccountPageLink page="forgotPassword" locale={locale}>
        {getDictionary(locale).account.otherPages.cantSignIn}
      </AccountPageLink>
    </p>
  )
}
