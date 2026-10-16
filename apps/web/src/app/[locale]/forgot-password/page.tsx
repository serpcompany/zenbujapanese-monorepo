import type { Metadata } from 'next'
import {
  AccountPageLink,
  LinkedLine,
  OtherAccountPages
} from '@/components/account/account-page-shell'
import { AccountSignInPage } from '@/components/account/account-sign-in-page'
import { accountMetadata } from '@/lib/account/metadata'
import { type AccountSettings, accountSettings } from '@/lib/account/settings'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params
}: PageProps<'/[locale]/forgot-password'>): Promise<Metadata> {
  return accountMetadata('forgotPassword', await localeOf(params))
}

function otherWaysIn(settings: AccountSettings | null, locale: Locale): string | null {
  const ways = [
    settings?.appleServicesId ? 'Apple' : null,
    settings?.google ? 'Google' : null
  ].filter(way => way !== null)
  if (ways.length === 0) return null
  return new Intl.ListFormat(locale, { type: 'disjunction' }).format(ways)
}

export default async function ForgotPasswordPage({
  params
}: PageProps<'/[locale]/forgot-password'>) {
  const locale = await localeOf(params)
  const text = getDictionary(locale).account
  const settings = await accountSettings()
  const otherWays = otherWaysIn(settings, locale)
  return (
    <AccountSignInPage
      page="forgotPassword"
      purpose="email-only"
      locale={locale}
      settings={settings}
      returnedError={null}
    >
      {otherWays ? (
        <OtherAccountPages>
          <LinkedLine
            template={text.otherPages.madeWith}
            values={{
              ways: otherWays,
              link: (
                <AccountPageLink page="signIn" locale={locale}>
                  {text.otherPages.signInThatWay}
                </AccountPageLink>
              )
            }}
          />
        </OtherAccountPages>
      ) : null}
    </AccountSignInPage>
  )
}
