'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { useSeemsSignedIn } from '@/hooks/use-seems-signed-in'
import { accountApi } from '@/lib/account/client'
import { returnedErrorMessage } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import { rememberSignedIn } from '@/lib/account/signed-in'
import { FormMessage } from './form-message'
import { SignInOptions, type SignInWays } from './sign-in-options'

const wording = {
  'sign-in': { verb: 'Sign in', signIn: 'Sign in' },
  register: { verb: 'Sign up', signIn: 'Create account' },
  'email-only': { verb: 'Sign in', signIn: 'Sign in' }
} as const

const everyWay: SignInWays = { apple: true, google: true, email: true }
const emailOnly: SignInWays = { apple: false, google: false, email: true }

export function SignInForm({
  settings,
  purpose,
  returnedError
}: {
  settings: AccountSettings
  purpose: keyof typeof wording
  returnedError: string | null
}) {
  const api = useMemo(() => accountApi(settings.apiUrl), [settings.apiUrl])
  const router = useRouter()
  const signedIn = useSeemsSignedIn()
  const { verb, signIn } = wording[purpose]
  const here = purpose === 'register' ? accountPages.register.path : accountPages.signIn.path

  return (
    <div className="flex flex-col gap-4">
      {signedIn ? (
        <output className="block rounded-lg bg-muted px-3 py-2 text-sm">
          You’re signed in. <Link href={accountPages.account.path}>Go to your account</Link>.
        </output>
      ) : null}
      <FormMessage problem={returnedError ? returnedErrorMessage(returnedError) : null} />
      <SignInOptions
        api={api}
        settings={settings}
        ways={purpose === 'email-only' ? emailOnly : everyWay}
        verb={verb}
        emailLabels={{ send: 'Email me a code', signIn }}
        googleReturn={{ done: accountPages.account.path, failed: here }}
        onSignedIn={() => {
          rememberSignedIn(true)
          router.push(accountPages.account.path)
        }}
      />
    </div>
  )
}
