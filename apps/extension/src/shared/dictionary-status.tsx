import { Button } from '@zenbu/ui/components/button'
import type { DataState } from './data-state'
import { DictionaryProgress, type ReadData, useDataState } from './dictionary-progress'
import { labels } from './labels'

export function DictionaryStatus({ read, check }: { read?: ReadData; check?: ReadData }) {
  const [data, again] = useDataState({ read, check })
  const shown: DataState = data ?? { state: 'checking' }
  return (
    <div data-dictionary-status={shown.state} className="flex flex-col items-start gap-3">
      <DictionaryProgress data={shown} />
      <Button
        variant="outline"
        onClick={again}
        disabled={shown.state !== 'ready' && shown.state !== 'failed'}
      >
        {labels.dictionary.checkAgain}
      </Button>
    </div>
  )
}
