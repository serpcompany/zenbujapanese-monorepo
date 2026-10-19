'use client'

import { type FormEvent, useId, useState } from 'react'
import { Fill } from '@/components/fill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AccountApi, Failure } from '@/lib/account/client'
import { type AccountText, failureMessage, type ProvidersHere } from '@/lib/account/messages'
import type { Locale } from '@/lib/i18n/config'
import { FormMessage } from './form-message'

interface EmailCodeFormProps {
  api: AccountApi
  locale: Locale
  text: AccountText
  email?: string
  signInLabel: string
  onSignedIn: () => void | Promise<void>
  mayVerify?: () => boolean
  onRefusal?: (failure: Failure) => boolean
  providersHere?: ProvidersHere
}

const emphasized = (email: string) => <strong className="text-foreground">{email}</strong>

export function EmailCodeForm({
  api,
  locale,
  text,
  email: fixedEmail,
  signInLabel,
  onSignedIn,
  mayVerify,
  onRefusal,
  providersHere
}: EmailCodeFormProps) {
  const id = useId()
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const words = text.emailCode
  const say = (failure: Failure) => failureMessage(failure, text.messages, locale, providersHere)

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const to = email.trim()
    if (to === '') return
    setBusy(true)
    setProblem(null)
    const sent = await api.sendCode(to)
    setBusy(false)
    if (!sent.ok) return setProblem(say(sent.failure))
    setSentTo(to)
    setCode('')
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (!sentTo || (mayVerify && !mayVerify())) return
    setBusy(true)
    setProblem(null)
    const signedIn = await api.signInWithCode(sentTo, code.trim())
    if (signedIn.ok) await onSignedIn()
    else if (!onRefusal?.(signedIn.failure)) setProblem(say(signedIn.failure))
    setBusy(false)
  }

  if (sentTo === null) {
    return (
      <form className="flex flex-col gap-3" onSubmit={send}>
        {fixedEmail ? (
          <p className="text-sm text-muted-foreground">
            <Fill template={words.willEmail} values={{ email: emphasized(fixedEmail) }} />
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-email`} className="text-sm font-medium">
              {words.email}
            </label>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </div>
        )}
        <FormMessage problem={problem} />
        <Button type="submit" size="lg" disabled={busy}>
          {words.send}
        </Button>
      </form>
    )
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={verify}>
      <output className="block text-sm text-muted-foreground">
        <Fill template={words.sent} values={{ email: emphasized(sentTo) }} />
      </output>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-code`} className="text-sm font-medium">
          {words.code}
        </label>
        <Input
          id={`${id}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={event => setCode(event.target.value)}
        />
      </div>
      <FormMessage problem={problem} />
      <Button type="submit" size="lg" disabled={busy}>
        {signInLabel}
      </Button>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          disabled={busy}
          onClick={() => send()}
        >
          {words.sendAgain}
        </Button>
        {fixedEmail ? null : (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={busy}
            onClick={() => {
              setSentTo(null)
              setProblem(null)
            }}
          >
            {words.anotherEmail}
          </Button>
        )}
      </div>
    </form>
  )
}
