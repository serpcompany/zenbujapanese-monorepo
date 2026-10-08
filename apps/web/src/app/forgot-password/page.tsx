import Link from 'next/link'
import {
  AccountPageShell,
  AccountUnavailable,
  OtherAccountPages
} from '@/components/account/account-page-shell'
import { SignInForm } from '@/components/account/sign-in-form'
import { accountMetadata, accountPages } from '@/lib/account/pages'
import { type AccountSettings, accountSettings } from '@/lib/account/settings'

export const dynamic = 'force-dynamic'

export const metadata = accountMetadata('forgotPassword')

function otherWaysIn(settings: AccountSettings | null): string | null {
  const ways = [
    settings?.appleServicesId ? 'Apple' : null,
    settings?.google ? 'Google' : null
  ].filter(way => way !== null)
  return ways.length > 0 ? ways.join(' or ') : null
}

export default async function ForgotPasswordPage() {
  const settings = await accountSettings()
  const otherWays = otherWaysIn(settings)
  return (
    <AccountPageShell
      title={accountPages.forgotPassword.title}
      intro={
        settings
          ? 'Zenbu accounts have no password, so there’s nothing to reset. Enter your email and we’ll send you a code that signs you in.'
          : null
      }
    >
      {settings ? (
        <SignInForm settings={settings} purpose="email-only" returnedError={null} />
      ) : (
        <AccountUnavailable />
      )}
      {otherWays ? (
        <OtherAccountPages>
          <p>
            Made your account with {otherWays}?{' '}
            <Link href={accountPages.signIn.path}>Sign in that way</Link>.
          </p>
        </OtherAccountPages>
      ) : null}
    </AccountPageShell>
  )
}
