import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import type { PageToken } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import { SourceLine, type SourceServices } from '../translate/source-words'
import { type KeepPlace, useCaptionDrag } from './caption-drag'
import { placeStyle } from './caption-place'
import { type LineEnglish, useLineEnglish } from './line-english'

type Props = {
  lines: readonly Caption[]
  line: number
  settings: Settings
  services: SourceServices
  english: LineEnglish
  pick(token: PageToken, word: HTMLElement): void
  keepPlace: KeepPlace
}

const captionClass =
  'pointer-events-auto absolute w-max max-w-[min(92%,48em)] cursor-grab touch-none select-none data-dragging:cursor-grabbing data-dragging:**:cursor-grabbing rounded-lg bg-black/75 px-[0.6em] py-[0.3em] text-center text-[clamp(16px,2.4cqw,34px)] text-white [&_[data-aid=romaji]]:text-[0.6em] [&_[data-aid=romaji]]:text-white/80 [&_[data-aid=meaning]]:text-white/70 [&_[data-source]]:text-white'

export function PlayerCaption({
  lines,
  line,
  settings,
  services,
  english,
  pick,
  keepPlace
}: Props) {
  const text = lines[line].text
  const next = lines[line + 1]?.text ?? null
  const translation = useLineEnglish(english, text, next, settings['readingAids.translations'])
  const drag = useCaptionDrag(keepPlace)
  return (
    <div
      data-player-caption
      data-dragging={drag.moving ? '' : undefined}
      style={placeStyle(drag.moving ?? settings['videos.captionPlace'])}
      className={captionClass}
      {...drag.handlers}
    >
      <SourceLine source={text} settings={settings} services={services} pick={pick} />
      {translation ? (
        <p lang="en" data-aid="translation" className="text-[0.7em] leading-snug text-white/90">
          {translation}
        </p>
      ) : null}
    </div>
  )
}
