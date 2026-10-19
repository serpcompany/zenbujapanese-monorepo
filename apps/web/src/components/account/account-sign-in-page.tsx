import type { ComponentProps, ReactNode } from 'react'
import type { AccountPage } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { AccountPageShell } from './account-page-shell'
import { SignInForm } from './sign-in-form'

export function AccountSignInPage({
  page,
  purpose,
  locale,
  settings,
  returnedError,
  children
}: {
  page: AccountPage
  purpose: ComponentProps<typeof SignInForm>['purpose']
  locale: Locale
  settings: AccountSettings | null
  returnedError: string | null
  children: ReactNode
}) {
  const text = getDictionary(locale).account
  return (
    <AccountPageShell page={page} locale={locale} settings={settings}>
      {offered => (
        <>
          <SignInForm
            locale={locale}
            text={text}
            settings={offered}
            purpose={purpose}
            returnedError={returnedError}
          />
          {children}
        </>
      )}
    </AccountPageShell>
  )
}
