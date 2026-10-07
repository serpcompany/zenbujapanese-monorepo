import Link from 'next/link'
import {
  AccountPageShell,
  AccountUnavailable,
  OtherAccountPages
} from '@/components/account/account-page-shell'
import { SignInForm } from '@/components/account/sign-in-form'
import { accountMetadata, accountPages } from '@/lib/account/pages'
import { accountSettings } from '@/lib/account/settings'

export const dynamic = 'force-dynamic'

export const metadata = accountMetadata('forgotPassword')

export default async function ForgotPasswordPage() {
  const settings = await accountSettings()
  return (
    <AccountPageShell
      title={accountPages.forgotPassword.title}
      intro="Zenbu accounts have no password, so there’s nothing to reset. Enter your email and we’ll send you a code that signs you in."
    >
      {settings ? (
        <SignInForm settings={settings} purpose="email-only" returnedError={null} />
      ) : (
        <AccountUnavailable />
      )}
      <OtherAccountPages>
        <p>
          Made your account with Apple or Google?{' '}
          <Link href={accountPages.signIn.path}>Sign in that way</Link>.
        </p>
      </OtherAccountPages>
    </AccountPageShell>
  )
}
