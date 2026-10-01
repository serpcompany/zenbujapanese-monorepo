'use client'

import {
  type FrequencyDetails,
  type FrequencyRowDetail,
  frequencyRowLabel
} from '@zenbu/dictionary-core/detail/frequency'
import { useState } from 'react'
import { FrequencyDot, SpokenTier } from './frequency'
import { Sheet } from './sheet'

export function FrequencyDetailsContent({ details }: { details: FrequencyDetails }) {
  const { pack } = details
  return (
    <div className="flex flex-col gap-4" data-frequency-details>
      <section className="flex flex-col gap-2" data-details-section="pack">
        <h3 className="font-medium">{pack.name}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted-foreground">Domain</dt>
          <dd>{pack.domain}</dd>
        </dl>
        <p>{pack.description}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted-foreground">Version</dt>
          <dd>{pack.version}</dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd>{pack.source}</dd>
        </dl>
      </section>
      <section className="flex flex-col gap-2" data-details-section={details.section}>
        <h3 className="font-medium">{details.section}</h3>
        {details.rows.length > 0 ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {details.rows.map(row => (
              <div key={row.label} className="contents" data-details-row>
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {details.explanation ? <p data-details-explanation>{details.explanation}</p> : null}
      </section>
    </div>
  )
}

export function FrequencySection({ rows }: { rows: FrequencyRowDetail[] }) {
  const [open, setOpen] = useState<FrequencyRowDetail | null>(null)
  const [lastOpened, setLastOpened] = useState<FrequencyRowDetail | null>(null)
  return (
    <>
      <ul className="-mx-2 flex flex-col">
        {rows.map(row => (
          <li key={row.source}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={frequencyRowLabel(row)}
              data-frequency-row={row.source}
              className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              onClick={() => {
                setLastOpened(row)
                setOpen(row)
              }}
            >
              <FrequencyDot tier={row.tier} />
              {row.source}
              <span className="ml-auto text-muted-foreground tabular-nums">
                {row.value}
                <SpokenTier result={row} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Sheet
        open={open !== null}
        onOpenChange={next => {
          if (!next) setOpen(null)
        }}
        title="Frequency Details"
      >
        {lastOpened ? <FrequencyDetailsContent details={lastOpened.details} /> : null}
      </Sheet>
    </>
  )
}
