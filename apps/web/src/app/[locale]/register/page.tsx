import Link from 'next/link'
import {
  AccountPageShell,
  AccountUnavailable,
  OtherAccountPages
} from '@/components/account/account-page-shell'
import { SignInForm } from '@/components/account/sign-in-form'
import { accountMetadata, accountPages, returnedError } from '@/lib/account/pages'
import { accountSettings } from '@/lib/account/settings'

export const dynamic = 'force-dynamic'

export const metadata = accountMetadata('register')

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const settings = await accountSettings()
  return (
    <AccountPageShell
      title={accountPages.register.title}
      intro={
        settings
          ? 'Make your Zenbu account. There’s no password: a new email gets a code that makes your account, and an email that has one signs you in to it.'
          : null
      }
    >
      {settings ? (
        <SignInForm
          settings={settings}
          purpose="register"
          returnedError={returnedError(await searchParams)}
        />
      ) : (
        <AccountUnavailable />
      )}
      {settings ? (
        <OtherAccountPages>
          <p>
            Already have an account? <Link href={accountPages.signIn.path}>Sign in</Link>
          </p>
          <p>
            <Link href={accountPages.forgotPassword.path}>Can’t sign in?</Link>
          </p>
          <p>
            Read how we handle your account in the{' '}
            <Link href="/legal/privacy/">Privacy Policy</Link>.
          </p>
        </OtherAccountPages>
      ) : null}
    </AccountPageShell>
  )
}
