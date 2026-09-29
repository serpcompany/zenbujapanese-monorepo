import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { PitchAccent as PitchAccentData } from '@/lib/dictionary/detail/pitch'
import type { RubySegment } from '@/lib/dictionary/detail/ruby'
import { HeadwordRuby } from './headword-ruby'
import { PitchAccent } from './pitch-accent'
import { PronounceButton } from './pronounce-button'

/**
 * The word page's header card, as the app's WordHeadline: the headword with furigana, whose kanji
 * highlight their part of the reading when selected, and beside it the pitch accent capsule that
 * pronounces the word, or a standalone speaker when the word has no pitch. The part of speech
 * follows under a separator.
 */
export function WordHeader({
  ruby,
  reading,
  pitch,
  partOfSpeech
}: {
  ruby: RubySegment[]
  reading: string
  pitch: PitchAccentData | null
  partOfSpeech: string
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
        {partOfSpeech ? (
          <>
            <Separator />
            <p className="text-sm">{partOfSpeech}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
