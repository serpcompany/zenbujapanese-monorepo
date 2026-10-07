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

export const metadata = accountMetadata('signIn')

export default async function SignInPage({ searchParams }: PageProps<'/login'>) {
  const settings = await accountSettings()
  return (
    <AccountPageShell
      title={accountPages.signIn.title}
      intro="Sign in to your Zenbu account. There’s no password."
    >
      {settings ? (
        <SignInForm
          settings={settings}
          purpose="sign-in"
          returnedError={returnedError(await searchParams)}
        />
      ) : (
        <AccountUnavailable />
      )}
      <OtherAccountPages>
        <p>
          New here? <Link href={accountPages.register.path}>Create an account</Link>
        </p>
        <p>
          <Link href={accountPages.forgotPassword.path}>Forgot your password?</Link>
        </p>
      </OtherAccountPages>
    </AccountPageShell>
  )
}
