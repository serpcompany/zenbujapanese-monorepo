import { signInCode, signInCodeOf } from '@zenbu/account-rules/sign-in-code'
import { Button } from '@zenbu/ui/components/button'
import { Input } from '@zenbu/ui/components/input'
import { Label } from '@zenbu/ui/components/label'
import { Separator } from '@zenbu/ui/components/separator'
import { type ComponentProps, type FormEvent, useId, useState } from 'react'
import { type AccountAnswer, askAccount, type SignInWay } from '../shared/account'
import { googleClientId } from '../shared/hosts'
import { Problem, useAsking } from './asking'
import { accountLabels } from './labels'

type Props = {
  purpose: 'sign-in' | 'delete'
  email?: string
  onAnswer?: (answer: AccountAnswer) => void
}

type FieldProps = ComponentProps<typeof Input> & { label: string }

function Field({ label, ...input }: FieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required {...input} />
    </div>
  )
}

export function SignInWays({ purpose, email: fixedEmail, onAnswer }: Props) {
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [problemAt, setProblemAt] = useState<'code' | 'provider'>('code')
  const asking = useAsking()
  const { busy, problem } = asking
  const codeProblem = problemAt === 'code' ? problem : null
  const providerProblem = problemAt === 'provider' ? problem : null

  async function ask(answering: Promise<AccountAnswer>, at: 'code' | 'provider' = 'code') {
    setProblemAt(at)
    const answer = await asking.ask(answering)
    onAnswer?.(answer)
    return answer
  }

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const to = email.trim()
    if (to === '') return
    const deleting = purpose === 'delete' ? { deleting: true as const } : {}
    const answer = await ask(askAccount({ account: 'send-code', email: to, ...deleting }))
    if (answer.type === 'code-sent') {
      setSentTo(to)
      setCode('')
    }
  }

  const signIn = (way: SignInWay) =>
    ask(
      askAccount(
        purpose === 'delete' ? { account: 'delete', with: way } : { account: 'sign-in', with: way }
      ),
      way.way === 'code' ? 'code' : 'provider'
    )

  function verify(event: FormEvent) {
    event.preventDefault()
    const typed = signInCodeOf(code)
    if (sentTo !== null && typed !== null) void signIn({ way: 'code', email: sentTo, code: typed })
  }

  const codeForm =
    sentTo === null ? (
      <form className="flex flex-col gap-3" onSubmit={send}>
        <Field
          label={accountLabels.email}
          type="email"
          autoComplete="email"
          readOnly={fixedEmail !== undefined}
          value={email}
          onChange={event => setEmail(event.target.value)}
        />
        <Problem problem={codeProblem} />
        <Button type="submit" disabled={busy}>
          {accountLabels.sendCode}
        </Button>
      </form>
    ) : (
      <form className="flex flex-col gap-3" onSubmit={verify}>
        <output className="block text-sm text-muted-foreground">
          {accountLabels.sent} <strong className="text-foreground">{sentTo}</strong>.{' '}
          {accountLabels.sentFor}
        </output>
        <Field
          label={accountLabels.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={signInCode.typedPattern}
          value={code}
          onChange={event => setCode(event.target.value)}
        />
        <Problem problem={codeProblem} />
        <Button type="submit" disabled={busy}>
          {accountLabels.signIn}
        </Button>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={busy}
            onClick={() => send()}
          >
            {accountLabels.sendAgain}
          </Button>
          {fixedEmail === undefined && (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              disabled={busy}
              onClick={() => {
                setSentTo(null)
                asking.clearProblem()
              }}
            >
              {accountLabels.anotherEmail}
            </Button>
          )}
        </div>
      </form>
    )

  return (
    <div data-sign-in={purpose} className="flex w-full flex-col gap-3 text-left">
      {codeForm}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        {accountLabels.or}
        <Separator className="flex-1" />
      </div>
      <div data-sign-in-providers className="flex flex-col gap-3">
        {googleClientId !== null && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => signIn({ way: 'google' })}
          >
            {accountLabels.google}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => signIn({ way: 'apple' })}
        >
          {accountLabels.apple}
        </Button>
        <Problem problem={providerProblem} />
      </div>
    </div>
  )
}
