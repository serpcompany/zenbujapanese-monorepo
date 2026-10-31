import type { ReactNode } from 'react'
import { type ShareServices, shareFraction, shareTone, useKnownShare } from './known-share'
import { videoTabLabels as labels } from './labels'
import type { KnownWords } from './word-marks'

type Props = {
  lines: readonly { text: string }[]
  services: ShareServices
  known: KnownWords
}

function Line({ children }: { children: ReactNode }) {
  return (
    <p
      data-known-share
      className="shrink-0 truncate px-4 pb-2 text-xs text-muted-foreground tabular-nums"
    >
      {children}
    </p>
  )
}

export function KnownShareLine({ lines, services, known }: Props) {
  const share = useKnownShare(lines, services, known)
  if (share === 'hidden') return null
  if (share === 'counting' || share === 'incomplete') return <Line>{labels.countingKnown}</Line>
  const fraction = shareFraction(share)
  return (
    <Line>
      <span className={`font-bold ${shareTone(fraction)}`}>{labels.knownPercent(fraction)}</span>{' '}
      {labels.wordsKnown(share.known, share.total)}
    </Line>
  )
}
