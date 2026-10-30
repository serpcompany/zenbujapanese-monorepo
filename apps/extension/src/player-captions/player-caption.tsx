import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import type { PageToken } from '../page-lookup/words'
import type { CaptionPlaceKey, Settings } from '../shared/settings'
import { SourceLine, type SourceServices } from '../translate/source-words'
import { CaptionBox, captionRoomClass } from './caption-box'
import type { KeepPlace } from './caption-drag'
import { type LineEnglish, useLineEnglish } from './line-english'

export type KeepPlaces = Record<CaptionPlaceKey, KeepPlace>

type Props = {
  lines: readonly Caption[]
  line: number
  settings: Settings
  services: SourceServices
  english: LineEnglish
  pick(token: PageToken, word: HTMLElement): void
  keepPlace: KeepPlaces
}

const captionClass =
  'px-[0.6em] py-[0.3em] [&_[data-aid=romaji]]:text-[0.6em] [&_[data-aid=romaji]]:text-white/80 [&_[data-aid=meaning]]:text-white/70 [&_[data-source]]:text-white'

const translationClass = 'px-[0.7em] py-[0.32em] text-[0.7em] leading-snug'

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
  return (
    <div className={captionRoomClass}>
      <CaptionBox
        data-player-caption
        place={settings['videos.captionPlace']}
        keep={keepPlace['videos.captionPlace']}
        className={captionClass}
      >
        <SourceLine source={text} settings={settings} services={services} pick={pick} />
      </CaptionBox>
      {translation ? (
        <CaptionBox
          data-player-translation
          lang="en"
          place={settings['videos.translationPlace']}
          keep={keepPlace['videos.translationPlace']}
          className={translationClass}
        >
          {translation}
        </CaptionBox>
      ) : null}
    </div>
  )
}
