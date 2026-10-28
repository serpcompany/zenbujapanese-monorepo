import { useCallback, useEffect, useState } from 'react'
import type { DataState } from './data-state'
import { checkForUpdates, readDataState, type StateAnswer } from './dictionary'
import { labels } from './labels'
import type { Failure } from './messages'

export type ReadData = () => Promise<StateAnswer | Failure>

const pollMs = 1000

const shown = (answer: StateAnswer | Failure): DataState =>
  answer.type === 'state' ? answer.data : { state: 'failed', reason: answer.reason }

export type DataStateOptions = { read?: ReadData; check?: ReadData; waiting?: boolean }

export function useDataState({
  read = readDataState,
  check = checkForUpdates,
  waiting = false
}: DataStateOptions = {}): [DataState | null, () => Promise<void>] {
  const [data, setData] = useState<DataState | null>(null)

  const send = useCallback(
    (ask: ReadData) =>
      Promise.resolve()
        .then(ask)
        .then(
          answer => setData(shown(answer)),
          (error: unknown) =>
            setData({
              state: 'failed',
              reason: error instanceof Error ? error.message : String(error)
            })
        ),
    []
  )

  useEffect(() => {
    send(read)
  }, [send, read])

  const settled = !waiting && (data?.state === 'ready' || data?.state === 'failed')
  useEffect(() => {
    if (settled) return
    const timer = setInterval(() => {
      send(read)
    }, pollMs)
    return () => clearInterval(timer)
  }, [send, read, settled])

  return [data, useCallback(() => send(check), [send, check])]
}

const megabytes = (bytes: number) => Math.round(bytes / 1_000_000)

function DownloadBar({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.floor((done / total) * 100) : 0
  return (
    <div className="flex w-full flex-col gap-2">
      <div
        role="progressbar"
        aria-label={labels.progress.bar}
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

const line = (text: string) => <p className="text-sm text-muted-foreground">{text}</p>

export function DictionaryProgress({ data }: { data: DataState }) {
  switch (data.state) {
    case 'checking':
      return line(labels.progress.checking)
    case 'downloading':
      return (
        <div className="flex w-full flex-col gap-2">
          {line(labels.progress.downloading)}
          <DownloadBar done={data.done} total={data.total} />
        </div>
      )
    case 'updating':
      return (
        <div className="flex w-full flex-col gap-2">
          {line(labels.progress.ready)}
          {data.total > 0 ? (
            <>
              {line(labels.progress.updating)}
              <DownloadBar done={data.done} total={data.total} />
            </>
          ) : (
            line(labels.progress.checkingForUpdates)
          )}
        </div>
      )
    case 'ready':
      return (
        <div className="flex flex-col gap-1">
          {line(labels.progress.ready)}
          {data.updateFailed && line(`${labels.progress.updateFailed} ${data.updateFailed}`)}
        </div>
      )
    case 'failed':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{labels.progress.failed}</p>
          {line(data.reason)}
        </div>
      )
  }
}
