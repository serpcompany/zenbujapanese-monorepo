import type { Metadata } from 'next'
import {
  AccountPageLink,
  CantSignIn,
  LinkedLine,
  OtherAccountPages
} from '@/components/account/account-page-shell'
import { AccountSignInPage } from '@/components/account/account-sign-in-page'
import { accountMetadata } from '@/lib/account/metadata'
import { returnedError } from '@/lib/account/pages'
import { accountSettings } from '@/lib/account/settings'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params
}: PageProps<'/[locale]/login'>): Promise<Metadata> {
  return accountMetadata('signIn', await localeOf(params))
}

export default async function LoginPage({ params, searchParams }: PageProps<'/[locale]/login'>) {
  const locale = await localeOf(params)
  const text = getDictionary(locale).account
  return (
    <AccountSignInPage
      page="signIn"
      purpose="sign-in"
      locale={locale}
      settings={await accountSettings()}
      returnedError={returnedError(await searchParams)}
    >
      <OtherAccountPages>
        <LinkedLine
          template={text.otherPages.newHere}
          values={{
            link: (
              <AccountPageLink page="register" locale={locale}>
                {text.createAnAccount}
              </AccountPageLink>
            )
          }}
        />
        <CantSignIn locale={locale} />
      </OtherAccountPages>
    </AccountSignInPage>
  )
}
