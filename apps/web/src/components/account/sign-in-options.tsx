'use client'

import { useState } from 'react'
import { useAppleSignIn } from '@/hooks/use-apple-sign-in'
import { useBusy } from '@/hooks/use-busy'
import type { AppleAuthorization, AppleCode } from '@/lib/account/apple'
import type { AccountApi } from '@/lib/account/client'
import { type AccountText, failureMessage } from '@/lib/account/messages'
import type { AccountSettings } from '@/lib/account/settings'
import type { Locale } from '@/lib/i18n/config'
import { EmailCodeForm } from './email-code-form'
import { FormMessage } from './form-message'
import { AppleButton, GoogleButton } from './provider-buttons'

export interface SignInWays {
  apple: boolean
  google: boolean
  email: boolean
}

type SignInButtons = AccountText['buttons']['signIn']

interface SignInOptionsProps {
  api: AccountApi
  locale: Locale
  text: AccountText
  settings: AccountSettings
  ways: SignInWays
  email?: string
  buttons: SignInButtons
  googleReturn: { done: string; failed: string }
  refuseApple?: (authorization: AppleAuthorization) => string | null
  beforeGoogle?: () => boolean
  onSignedIn: (apple: AppleCode | null) => void | Promise<void>
}

export function SignInOptions({
  api,
  locale,
  text,
  settings,
  ways,
  email,
  buttons,
  googleReturn,
  refuseApple,
  beforeGoogle,
  onSignedIn
}: SignInOptionsProps) {
  const apple = useAppleSignIn(api, settings.appleServicesId, text.messages, locale)
  const [busy, setBusy] = useBusy()
  const [problem, setProblem] = useState<string | null>(null)
  const offersApple = ways.apple && settings.appleServicesId !== null
  const offersGoogle = ways.google && settings.google

  async function withApple() {
    setBusy(true)
    setProblem(null)
    const outcome = await apple.signIn()
    if (!outcome.ok) {
      setBusy(false)
      return setProblem(outcome.message)
    }
    const refused = refuseApple?.(outcome.authorization) ?? null
    if (refused) {
      setBusy(false)
      return setProblem(refused)
    }
    const { authorization, nonce, returnUrl } = outcome
    const signedIn = await api.signInWithApple({
      idToken: authorization.idToken,
      nonce,
      name: authorization.name
    })
    if (signedIn.ok) await onSignedIn({ code: authorization.code, returnUrl })
    else setProblem(failureMessage(signedIn.failure, text.messages, locale))
    setBusy(false)
  }

  async function withGoogle() {
    setBusy(true)
    setProblem(null)
    const origin = window.location.origin
    const started = await api.startGoogle({
      callbackURL: `${origin}${googleReturn.done}`,
      errorCallbackURL: `${origin}${googleReturn.failed}`
    })
    if (!started.ok) {
      setBusy(false)
      return setProblem(failureMessage(started.failure, text.messages, locale))
    }
    if (beforeGoogle && !beforeGoogle()) return setBusy(false)
    window.location.assign(started.value)
  }

  return (
    <div className="flex flex-col gap-4">
      {offersApple || offersGoogle ? (
        <div className="flex flex-col gap-2">
          {offersApple ? (
            <AppleButton
              label={buttons.apple}
              busy={busy}
              onIntent={() => void apple.prepare()}
              onClick={() => void withApple()}
            />
          ) : null}
          {offersGoogle ? (
            <GoogleButton label={buttons.google} busy={busy} onClick={() => void withGoogle()} />
          ) : null}
          <FormMessage problem={problem} />
        </div>
      ) : null}
      {(offersApple || offersGoogle) && ways.email ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          {text.or}
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      {ways.email ? (
        <EmailCodeForm
          api={api}
          locale={locale}
          text={text}
          email={email}
          signInLabel={buttons.submit}
          providersHere={{ apple: settings.appleServicesId !== null, google: settings.google }}
          onSignedIn={() => onSignedIn(null)}
        />
      ) : null}
    </div>
  )
}
