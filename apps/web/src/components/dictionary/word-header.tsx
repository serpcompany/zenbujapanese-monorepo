import type { Conjugations } from '@zenbu/dictionary-core/detail/conjugation'
import type { PitchAccent as PitchAccentData } from '@zenbu/dictionary-core/detail/pitch'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { ConjugationsLink } from './conjugations'
import { HeadwordRuby } from './headword-ruby'
import { PitchAccent } from './pitch-accent'
import { PronounceButton } from './pronounce-button'

export function WordHeader({
  headword,
  ruby,
  reading,
  pronounce,
  pitch,
  partOfSpeechRow,
  conjugations,
  locale
}: {
  headword: string
  ruby: RubySegment[]
  reading: string
  pronounce: string
  pitch: PitchAccentData | null
  partOfSpeechRow: string
  conjugations: Conjugations | null
  locale: Locale
}) {
  const t = getDictionary(locale)
  const pronounceLabel = coreText(pronounce, locale)
  const partOfSpeech = coreText(partOfSpeechRow, locale)
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 aria-label={headword}>
            <HeadwordRuby
              segments={ruby}
              readingsOutsideText
              className="block text-5xl font-medium leading-tight"
            />
          </h1>
          {pitch ? (
            <PitchAccent
              pitch={pitch}
              reading={reading}
              pronounce={pronounceLabel}
              spoken={coreText(pitch.spoken, locale)}
              text={t.pronounce}
            />
          ) : (
            <PronounceButton
              text={reading}
              label={pronounceLabel}
              unsupported={t.pronounce.unsupported}
            />
          )}
        </div>
        {conjugations ? (
          <>
            <Separator />
            <ConjugationsLink label={partOfSpeech} opens={t.conjugations.showsConjugations} />
          </>
        ) : partOfSpeechRow ? (
          <>
            <Separator />
            <p className="text-sm">{partOfSpeech}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
