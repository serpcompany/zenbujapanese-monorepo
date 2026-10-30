import { useState } from 'react'
import type { AccountAnswer } from '../shared/account'
import { accountLabels } from './labels'

function problemOf(answer: AccountAnswer): string | null {
  if (answer.type === 'failed') return accountLabels.refusals['try-again']
  if (answer.type !== 'refused') return null
  if (answer.refusal === 'wait' && answer.retryAfter !== null) {
    return accountLabels.waitFor(answer.retryAfter)
  }
  return accountLabels.refusals[answer.refusal]
}

export function Problem({ problem }: { problem: string | null }) {
  return problem ? (
    <p role="alert" className="text-sm text-destructive">
      {problem}
    </p>
  ) : null
}

export function useAsking() {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function ask(answering: Promise<AccountAnswer>): Promise<AccountAnswer> {
    setBusy(true)
    setProblem(null)
    const answer = await answering
    setBusy(false)
    setProblem(problemOf(answer))
    return answer
  }

  return { busy, problem, ask, clearProblem: () => setProblem(null) }
}
