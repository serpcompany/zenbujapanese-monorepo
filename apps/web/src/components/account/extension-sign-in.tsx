'use client'

import { Button } from '@zenbu/ui/components/button'
import { Fill } from '@zenbu/ui/lib/fill'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBusy } from '@/hooks/use-busy'
import { accountApi } from '@/lib/account/client'
import { extensionRuntime, type Handover, signInTheExtension } from '@/lib/account/extension'
import {
  type AccountText,
  failureMessage,
  isSignedOut,
  returnedErrorMessage
} from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import { rememberSignedIn } from '@/lib/account/signed-in'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { NotLoaded, type Unloaded } from './account-view'
import { FormMessage, Notice } from './form-message'
import { SignInOptions } from './sign-in-options'

type View = Unloaded | { kind: 'signed-out' } | { kind: 'signed-in'; email: string }

type Said = { notice: string | null; problem: string | null }

const nothingSaid: Said = { notice: null, problem: null }

function saidFor(handover: Handover, text: AccountText): Said {
  const words = text.extension
  if (handover === 'signed-in') return { notice: words.signedIn, problem: null }
  if (handover === 'signed-in-already') return { notice: words.signedInAlready, problem: null }
  if (handover === 'wait') return { notice: null, problem: text.messages.tooManyTries.wait }
  if (handover === 'no-extension') return { notice: null, problem: words.noExtension }
  return { notice: null, problem: words.tryAgain }
}

export function ExtensionSignIn({
  locale,
  text,
  settings,
  returnedError
}: {
  locale: Locale
  text: AccountText
  settings: AccountSettings
  returnedError: string | null
}) {
  const api = useMemo(() => accountApi(settings.apiUrl, locale), [settings.apiUrl, locale])
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [said, setSaid] = useState<Said>(nothingSaid)
  const [busy, setBusy] = useBusy()
  const here = localizedPath(accountPages.extension.path, locale)

  const load = useCallback(async () => {
    const session = await api.session()
    if (!session.ok && !isSignedOut(session.failure)) {
      return setView({ kind: 'unreachable', failure: session.failure })
    }
    if (!session.ok || session.value === null) {
      rememberSignedIn(false)
      return setView({ kind: 'signed-out' })
    }
    setView({ kind: 'signed-in', email: session.value.email })
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  async function signIn() {
    setBusy(true)
    setSaid(nothingSaid)
    const outcome = await signInTheExtension(api, extensionRuntime())
    setBusy(false)
    if ('handover' in outcome) return setSaid(saidFor(outcome.handover, text))
    if (isSignedOut(outcome.failure)) return void load()
    setSaid({ notice: null, problem: failureMessage(outcome.failure, text.messages, locale) })
  }

  if (view.kind === 'loading' || view.kind === 'unreachable') {
    return <NotLoaded view={view} locale={locale} text={text} onRetry={() => void load()} />
  }
  if (view.kind === 'signed-out') {
    return (
      <div className="flex flex-col gap-4">
        <p>{text.extension.signInFirst}</p>
        <FormMessage
          problem={returnedError ? returnedErrorMessage(returnedError, text.messages) : null}
        />
        <SignInOptions
          api={api}
          locale={locale}
          text={text}
          settings={settings}
          ways={{ apple: true, google: true, email: true }}
          buttons={text.buttons.signIn}
          googleReturn={{ done: here, failed: here }}
          onSignedIn={() => {
            rememberSignedIn(true)
            void load()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        <Fill
          template={text.view.signedInAs}
          values={{ email: <strong className="text-foreground">{view.email}</strong> }}
        />
      </p>
      <Button type="button" className="self-start" disabled={busy} onClick={() => void signIn()}>
        {text.extension.signIn}
      </Button>
      <Notice>{said.notice}</Notice>
      <FormMessage problem={said.problem} />
    </div>
  )
}
