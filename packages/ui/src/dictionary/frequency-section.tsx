'use client'

import type { FrequencyDetails } from '@zenbu/dictionary-core/detail/frequency'
import { useState } from 'react'
import type { ShownFrequency } from './frequency'
import { FrequencyDot, SpokenTier } from './frequency-dot'
import { Sheet } from './sheet'

export interface FrequencyText {
  detailsTitle: string
  domain: string
  version: string
  source: string
  done: string
}

export interface ShownFrequencyRow extends ShownFrequency {
  label: string
  details: FrequencyDetails & { shownSection: string }
}

export function FrequencyDetailsContent({
  details,
  text
}: {
  details: ShownFrequencyRow['details']
  text: FrequencyText
}) {
  const { pack } = details
  return (
    <div className="flex flex-col gap-4" data-frequency-details>
      <section className="flex flex-col gap-2" data-details-section="pack">
        <h3 className="font-medium">{pack.name}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted-foreground">{text.domain}</dt>
          <dd>{pack.domain}</dd>
        </dl>
        <p>{pack.description}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted-foreground">{text.version}</dt>
          <dd>{pack.version}</dd>
          <dt className="text-muted-foreground">{text.source}</dt>
          <dd>{pack.source}</dd>
        </dl>
      </section>
      <section className="flex flex-col gap-2" data-details-section={details.section}>
        <h3 className="font-medium">{details.shownSection}</h3>
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

export function FrequencySection({
  rows,
  text
}: {
  rows: ShownFrequencyRow[]
  text: FrequencyText
}) {
  const [open, setOpen] = useState<ShownFrequencyRow | null>(null)
  const [lastOpened, setLastOpened] = useState<ShownFrequencyRow | null>(null)
  return (
    <>
      <ul className="-mx-2 flex flex-col">
        {rows.map(row => (
          <li key={row.source}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={row.label}
              data-frequency-row={row.source}
              className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              onClick={() => {
                setLastOpened(row)
                setOpen(row)
              }}
            >
              <FrequencyDot tier={row.tier} />
              {row.shownSource}
              <span className="ml-auto text-muted-foreground tabular-nums">
                {row.value}
                <SpokenTier text={row.spokenTier} />
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
        title={text.detailsTitle}
        done={text.done}
      >
        {lastOpened ? <FrequencyDetailsContent details={lastOpened.details} text={text} /> : null}
      </Sheet>
    </>
  )
}
