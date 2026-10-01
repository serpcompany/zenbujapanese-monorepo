import type { Conjugations } from '@zenbu/dictionary-core/detail/conjugation'
import type { PitchAccent as PitchAccentData } from '@zenbu/dictionary-core/detail/pitch'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ConjugationsButton } from './conjugations'
import { HeadwordRuby } from './headword-ruby'
import { PitchAccent } from './pitch-accent'
import { PronounceButton } from './pronounce-button'

export function WordHeader({
  ruby,
  reading,
  summary,
  pitch,
  partOfSpeech,
  conjugations,
  path
}: {
  ruby: RubySegment[]
  reading: string
  summary: string
  pitch: PitchAccentData | null
  partOfSpeech: string
  conjugations: Conjugations | null
  path: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <HeadwordRuby segments={ruby} className="text-5xl font-medium leading-tight" />
          {pitch ? (
            <PitchAccent pitch={pitch} reading={reading} />
          ) : (
            <PronounceButton text={reading} label={`Pronounce ${reading}`} />
          )}
        </div>
        {conjugations ? (
          <>
            <Separator />
            <ConjugationsButton
              word={{ ruby, reading, summary, partOfSpeech, pitch }}
              conjugations={conjugations}
              wordPath={path}
            />
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
