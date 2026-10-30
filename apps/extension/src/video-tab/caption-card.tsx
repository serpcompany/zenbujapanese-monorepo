import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { Button } from '@zenbu/ui/components/button'
import { memo } from 'react'
import { captionLabels } from '../captions/labels'
import type { PageToken } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import { CaptionWords } from './caption-words'
import { videoTabLabels } from './labels'
import type { VideoTabServices } from './services'
import type { CaptionGlosses, KnownWords } from './word-marks'

const cardClass =
  'muted-surface relative min-w-0 rounded-xl bg-muted px-3.5 pt-6.5 pb-3.25 transition-colors hover:bg-(--player-hover) data-current:bg-blue-600/10 data-current:inset-ring-2 data-current:inset-ring-blue-600 motion-reduce:transition-none dark:data-current:bg-blue-400/16 dark:data-current:inset-ring-blue-400'

const playClass =
  'cursor-pointer outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50'

const rangeClass =
  'absolute top-1.75 right-3 text-xs leading-[1.4] text-blue-600 tabular-nums dark:text-blue-400'

const contentClass =
  'pointer-events-none relative flex flex-col [&_a]:pointer-events-auto [&_button]:pointer-events-auto'

type CardProps = {
  line: Caption
  current: boolean
  english: string | undefined
  englishFailed: boolean
  retryEnglish(text: string): void
  settings: Settings | null
  services: VideoTabServices
  glosses: CaptionGlosses
  known: KnownWords
  selected: number | null
  playFrom(line: Caption): void
  open(line: Caption, token: PageToken, from: HTMLElement): void
}

export const CaptionCard = memo(function CaptionCard({
  line,
  current,
  english,
  englishFailed,
  retryEnglish,
  playFrom,
  open,
  ...words
}: CardProps) {
  return (
    <li
      data-line={line.id}
      data-current={current ? '' : undefined}
      aria-current={current ? 'true' : undefined}
      className={cardClass}
    >
      <button
        type="button"
        data-play-line
        aria-label={videoTabLabels.playFrom(line.start)}
        className={playClass}
        onClick={() => playFrom(line)}
      >
        <span className={rangeClass}>{videoTabLabels.timeRange(line.start, line.end)}</span>
      </button>
      <div className={contentClass}>
        <CaptionWords
          source={line.text}
          open={(token, from) => open(line, token, from)}
          {...words}
        />
        {english ? (
          <p lang="en" data-english className="mt-2 text-sm leading-[1.4] text-muted-foreground">
            {english}
          </p>
        ) : null}
        {!english && englishFailed ? (
          <div data-english-failed className="mt-2 flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{videoTabLabels.englishFailed}</p>
            <Button variant="outline" size="sm" onClick={() => retryEnglish(line.text)}>
              {captionLabels.tryAgain}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  )
})
