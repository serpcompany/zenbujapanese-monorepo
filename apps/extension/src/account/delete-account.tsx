import { Button } from '@zenbu/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@zenbu/ui/components/dialog'
import { useState } from 'react'
import { type AccountAnswer, askAccount, type KeptSubscription } from '../shared/account'
import { accountLabels } from './labels'
import { Problem, problemOf, SignInWays } from './sign-in-ways'
import { appStoreRuns, websiteRuns } from './subscription'

export type Deleted = Extract<AccountAnswer, { type: 'deleted' }>

type Step = 'confirm' | 'sign-in' | 'apple'

const words = accountLabels.deletion

type Props = {
  email: string
  subscription: KeptSubscription | null
  onDeleted: (deleted: Deleted) => void
}

export function DeleteAccount({ email, subscription, onDeleted }: Props) {
  const [step, setStep] = useState<Step | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  function settle(answer: AccountAnswer) {
    if (answer.type === 'deleted') {
      setStep(null)
      onDeleted(answer)
    }
    if (answer.type === 'apple-needed') setStep('apple')
  }

  async function withApple() {
    setBusy(true)
    setProblem(null)
    const answer = await askAccount({ account: 'delete-with-apple' })
    setBusy(false)
    setProblem(problemOf(answer))
    settle(answer)
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => {
          setProblem(null)
          setStep('confirm')
        }}
      >
        {words.deleteAccount}
      </Button>
      <Dialog open={step !== null} onOpenChange={open => (open ? undefined : setStep(null))}>
        <DialogContent data-delete-step={step ?? undefined}>
          <DialogHeader>
            <DialogTitle>{words.title}</DialogTitle>
            <DialogDescription>{words.explained}</DialogDescription>
          </DialogHeader>
          {step === 'confirm' && (
            <>
              {appStoreRuns(subscription) && (
                <p data-app-store-continues className="text-sm font-medium">
                  {words.appStoreContinues}
                </p>
              )}
              {websiteRuns(subscription) && <p className="text-sm">{words.websiteEnds}</p>}
              {subscription === null && <p className="text-sm">{words.subscriptionUnknown}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(null)}>
                  {words.keep}
                </Button>
                <Button variant="destructive" onClick={() => setStep('sign-in')}>
                  {words.confirm}
                </Button>
              </DialogFooter>
            </>
          )}
          {step === 'sign-in' && (
            <>
              <p className="text-sm">
                {words.signInAgain} <strong>{email}</strong>.
              </p>
              <SignInWays purpose="delete" email={email} onAnswer={settle} />
            </>
          )}
          {step === 'apple' && (
            <>
              <p className="text-sm">{words.apple}</p>
              <Problem problem={problem} />
              <Button variant="outline" disabled={busy} onClick={withApple}>
                {accountLabels.apple}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
