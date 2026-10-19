import type { Metadata } from 'next'
import Link from 'next/link'
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
import { localizedPath } from '@/lib/i18n/paths'
import { pageFor } from '@/lib/pages'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params
}: PageProps<'/[locale]/register'>): Promise<Metadata> {
  return accountMetadata('register', await localeOf(params))
}

export default async function RegisterPage({
  params,
  searchParams
}: PageProps<'/[locale]/register'>) {
  const locale = await localeOf(params)
  const text = getDictionary(locale).account
  const privacyPolicy = pageFor('/legal/privacy/', locale)
  return (
    <AccountSignInPage
      page="register"
      purpose="register"
      locale={locale}
      settings={await accountSettings()}
      returnedError={returnedError(await searchParams)}
    >
      <OtherAccountPages>
        <LinkedLine
          template={text.otherPages.haveOne}
          values={{
            link: (
              <AccountPageLink page="signIn" locale={locale}>
                {text.signIn}
              </AccountPageLink>
            )
          }}
        />
        <CantSignIn locale={locale} />
        <LinkedLine
          template={text.otherPages.privacy}
          values={{
            link: (
              <Link href={localizedPath(privacyPolicy.path, locale)}>{privacyPolicy.title}</Link>
            )
          }}
        />
      </OtherAccountPages>
    </AccountSignInPage>
  )
}
