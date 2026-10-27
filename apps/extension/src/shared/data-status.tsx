import { useCallback, useEffect, useState } from 'react'
import type { DataState } from './data-state'
import { labels } from './labels'
import { askDictionary, type DictionaryAnswer, type Failure, failure } from './messages'

export type AskData = (request: { type: 'state' | 'update' }) => Promise<DictionaryAnswer | Failure>

const pollMs = 1000

function shown(answer: DictionaryAnswer | Failure): DataState {
  if (answer.type === 'state' || answer.type === 'not-ready') return answer.data
  if (answer.type === 'failed') return { state: 'failed', reason: answer.reason }
  return { state: 'checking' }
}

export function useDataState(ask: AskData = askDictionary) {
  const [data, setData] = useState<DataState>({ state: 'checking' })

  const send = useCallback(
    (type: 'state' | 'update') => {
      Promise.resolve()
        .then(() => ask({ type }))
        .then(
          answer => setData(shown(answer)),
          (error: unknown) => setData({ state: 'failed', reason: failure(error).reason })
        )
    },
    [ask]
  )

  const settled = data.state === 'ready' || data.state === 'failed'
  useEffect(() => send('state'), [send])

  useEffect(() => {
    if (settled) return
    const timer = setInterval(() => send('state'), pollMs)
    return () => clearInterval(timer)
  }, [send, settled])

  return { data, update: useCallback(() => send('update'), [send]) }
}

const megabytes = (bytes: number) => Math.round(bytes / 1_000_000)

function DownloadProgress({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.floor((done / total) * 100) : 0
  return (
    <div className="flex w-full flex-col gap-2">
      <div
        role="progressbar"
        aria-label={labels.welcome.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm tabular-nums text-muted-foreground">
        {`${percent}% · ${megabytes(done)} of ${megabytes(total)} MB`}
      </p>
    </div>
  )
}

export function DataStatus({ data }: { data: DataState }) {
  switch (data.state) {
    case 'checking':
      return <p className="text-sm text-muted-foreground">{labels.welcome.checking}</p>
    case 'downloading':
      return (
        <>
          <p className="text-sm text-muted-foreground">{labels.welcome.downloading}</p>
          <DownloadProgress done={data.done} total={data.total} />
        </>
      )
    case 'updating':
      return <p className="text-sm text-muted-foreground">{labels.welcome.ready}</p>
    case 'ready':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{labels.welcome.ready}</p>
          {data.updateFailed && (
            <p className="text-sm text-muted-foreground">{`${labels.welcome.updateFailed} ${data.updateFailed}`}</p>
          )}
        </div>
      )
    case 'failed':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{labels.welcome.failed}</p>
          <p className="text-sm text-muted-foreground">{data.reason}</p>
        </div>
      )
  }
}
