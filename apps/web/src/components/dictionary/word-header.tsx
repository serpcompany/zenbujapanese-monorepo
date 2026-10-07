import type { Conjugations } from '@zenbu/dictionary-core/detail/conjugation'
import type { PitchAccent as PitchAccentData } from '@zenbu/dictionary-core/detail/pitch'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ConjugationsLink } from './conjugations'
import { HeadwordRuby } from './headword-ruby'
import { PitchAccent } from './pitch-accent'
import { PronounceButton } from './pronounce-button'

export function WordHeader({
  headword,
  ruby,
  reading,
  pitch,
  partOfSpeech,
  conjugations
}: {
  headword: string
  ruby: RubySegment[]
  reading: string
  pitch: PitchAccentData | null
  partOfSpeech: string
  conjugations: Conjugations | null
}) {
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
            <PitchAccent pitch={pitch} reading={reading} />
          ) : (
            <PronounceButton text={reading} label={`Pronounce ${reading}`} />
          )}
        </div>
        {conjugations ? (
          <>
            <Separator />
            <ConjugationsLink partOfSpeech={partOfSpeech} />
          </>
        ) : partOfSpeech ? (
          <>
            <Separator />
            <p className="text-sm">{partOfSpeech}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
