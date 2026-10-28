import { Button } from '@zenbu/ui/components/button'
import { RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import type { InstalledRelease } from '../shared/data-state'
import { checkForUpdates } from '../shared/dictionary'
import { DictionaryProgress, useDataState } from '../shared/dictionary-progress'
import { settingsLabels } from './labels'

const text = settingsLabels.dictionaryData

const megabytes = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'megabyte',
  maximumFractionDigits: 1
})

const checkedAt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Release({ release }: { release: InstalledRelease }) {
  const rows: [string, string][] = [
    [text.release, release.release],
    [text.size, megabytes.format(release.bytes / 1_000_000)],
    [
      text.lastChecked,
      release.checkedAt === null ? text.never : checkedAt.format(release.checkedAt)
    ]
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DictionaryDataPage() {
  const [data, pollAgain] = useDataState()
  const [checking, setChecking] = useState(false)
  const downloading = data?.state === 'downloading' || data?.state === 'updating'
  const installed = data?.state === 'ready' || data?.state === 'updating' ? data : null
  return (
    <>
      {data ? (
        <DictionaryProgress data={data} />
      ) : (
        <p className="text-sm text-muted-foreground">{text.checking}</p>
      )}
      {installed ? <Release release={installed} /> : null}
      <Button
        variant="outline"
        className="self-start"
        disabled={checking || downloading}
        onClick={() => {
          setChecking(true)
          checkForUpdates().finally(() => {
            setChecking(false)
            pollAgain()
          })
        }}
      >
        <RefreshCwIcon data-icon="inline-start" />
        {text.checkForUpdates}
      </Button>
    </>
  )
}
