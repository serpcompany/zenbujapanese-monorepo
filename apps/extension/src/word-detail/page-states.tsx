import { Button } from '@zenbu/ui/components/button'
import { Empty, EmptyHeader, EmptyTitle } from '@zenbu/ui/components/empty'
import { DictionaryProgress } from '../shared/dictionary-progress'
import { wordDetailLabels } from './labels'
import type { Unanswered } from './lookups'

export function NotFound({ message }: { message: string }) {
  return (
    <Empty data-lookup="not-found">
      <EmptyHeader>
        <EmptyTitle>{message}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}

export function UnansweredLookup({ result, retry }: { result: Unanswered; retry: () => void }) {
  if (result.state === 'looking') return <div data-lookup="looking" />
  if (result.state === 'not-ready') return <DictionaryProgress data={result.data} />
  const { failed, tryAgain } = wordDetailLabels.lookup
  return (
    <Empty data-lookup="failed">
      <EmptyHeader>
        <EmptyTitle>{failed}</EmptyTitle>
      </EmptyHeader>
      <Button variant="outline" onClick={retry}>
        {tryAgain}
      </Button>
    </Empty>
  )
}
