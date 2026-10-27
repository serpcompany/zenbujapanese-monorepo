import { Button } from '@zenbu/ui/components/button'
import { useCallback, useEffect, useState } from 'react'
import { labels } from './labels'
import { askDictionary, type DictionaryAnswer, type Failure } from './messages'

type Status = 'checking' | 'ready' | 'failed'

export type Ask = () => Promise<DictionaryAnswer | Failure>

const pingDictionary: Ask = () => askDictionary({ type: 'ping' })

export function DictionaryStatus({ ask = pingDictionary }: { ask?: Ask }) {
  const [status, setStatus] = useState<Status>('checking')

  const check = useCallback(() => {
    setStatus('checking')
    ask().then(answer => setStatus(answer.type === 'pong' ? 'ready' : 'failed'))
  }, [ask])

  useEffect(check, [check])

  return (
    <div className="flex items-center justify-between gap-3">
      <p data-dictionary-status={status} className="text-sm text-muted-foreground">
        {labels.dictionary[status]}
      </p>
      <Button variant="outline" onClick={check} disabled={status === 'checking'}>
        {labels.dictionary.checkAgain}
      </Button>
    </div>
  )
}
