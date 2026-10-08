'use client'

import { type FormEvent, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AccountApi, Failure } from '@/lib/account/client'
import { failureMessage } from '@/lib/account/messages'
import { FormMessage } from './form-message'

interface EmailCodeFormProps {
  api: AccountApi
  email?: string
  sendLabel: string
  signInLabel: string
  onSignedIn: () => void | Promise<void>
  mayVerify?: () => boolean
  onRefusal?: (failure: Failure) => boolean
}

export function EmailCodeForm({
  api,
  email: fixedEmail,
  sendLabel,
  signInLabel,
  onSignedIn,
  mayVerify,
  onRefusal
}: EmailCodeFormProps) {
  const id = useId()
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const to = email.trim()
    if (to === '') return
    setBusy(true)
    setProblem(null)
    const sent = await api.sendCode(to)
    setBusy(false)
    if (!sent.ok) return setProblem(failureMessage(sent.failure))
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
    else if (!onRefusal?.(signedIn.failure)) setProblem(failureMessage(signedIn.failure))
    setBusy(false)
  }

  if (sentTo === null) {
    return (
      <form className="flex flex-col gap-3" onSubmit={send}>
        {fixedEmail ? (
          <p className="text-sm text-muted-foreground">
            We’ll email a code to <strong className="text-foreground">{fixedEmail}</strong>.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-email`} className="text-sm font-medium">
              Email
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
          {sendLabel}
        </Button>
      </form>
    )
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={verify}>
      <output className="block text-sm text-muted-foreground">
        We sent a 6-digit code to <strong className="text-foreground">{sentTo}</strong>. It works
        for 10 minutes.
      </output>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-code`} className="text-sm font-medium">
          Code
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
          Send a new code
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
            Use another email
          </Button>
        )}
      </div>
    </form>
  )
}
