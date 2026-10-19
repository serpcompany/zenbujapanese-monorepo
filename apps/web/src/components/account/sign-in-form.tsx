'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { Fill } from '@/components/fill'
import { useSeemsSignedIn } from '@/hooks/use-seems-signed-in'
import { accountApi } from '@/lib/account/client'
import { type AccountText, returnedErrorMessage } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import { rememberSignedIn } from '@/lib/account/signed-in'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { FormMessage } from './form-message'
import { SignInOptions, type SignInWays } from './sign-in-options'

const wording = { 'sign-in': 'signIn', register: 'register', 'email-only': 'signIn' } as const

const everyWay: SignInWays = { apple: true, google: true, email: true }
const emailOnly: SignInWays = { apple: false, google: false, email: true }

export function SignInForm({
  locale,
  text,
  settings,
  purpose,
  returnedError
}: {
  locale: Locale
  text: AccountText
  settings: AccountSettings
  purpose: keyof typeof wording
  returnedError: string | null
}) {
  const api = useMemo(() => accountApi(settings.apiUrl, locale), [settings.apiUrl, locale])
  const router = useRouter()
  const signedIn = useSeemsSignedIn()
  const here = purpose === 'register' ? accountPages.register.path : accountPages.signIn.path
  const accountPage = localizedPath(accountPages.account.path, locale)

  return (
    <div className="flex flex-col gap-4">
      {signedIn ? (
        <output className="block rounded-lg bg-muted px-3 py-2 text-sm">
          <Fill
            template={text.alreadySignedIn}
            values={{ link: <Link href={accountPage}>{text.goToAccount}</Link> }}
          />
        </output>
      ) : null}
      <FormMessage
        problem={returnedError ? returnedErrorMessage(returnedError, text.messages) : null}
      />
      <SignInOptions
        api={api}
        locale={locale}
        text={text}
        settings={settings}
        ways={purpose === 'email-only' ? emailOnly : everyWay}
        buttons={text.buttons[wording[purpose]]}
        googleReturn={{ done: accountPage, failed: localizedPath(here, locale) }}
        onSignedIn={() => {
          rememberSignedIn(true)
          router.push(accountPage)
        }}
      />
    </div>
  )
}
