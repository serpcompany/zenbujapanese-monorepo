import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { PitchAccent as PitchAccentData } from '@/lib/dictionary/detail/pitch'
import type { RubySegment } from '@/lib/dictionary/detail/ruby'
import { ConjugationsLink } from './conjugations'
import { HeadwordRuby } from './headword-ruby'
import { PitchAccent } from './pitch-accent'
import { PronounceButton } from './pronounce-button'
import { HeadlineAids } from './reading-aid'

/**
 * The word page's header card, as the app's WordHeadline: the headword with furigana, whose kanji
 * highlight their part of the reading when selected, and beside it the pitch accent capsule that
 * pronounces the word, or a standalone speaker when the word has no pitch. The part of speech
 * follows under a separator, and opens the conjugation table's page when the word has one
 * (PartOfSpeechRow, which pushes ConjugationsView). Under the headword are its Reading Aids:
 * romaji, and the reading with furigana off.
 */
export function WordHeader({
  ruby,
  reading,
  romaji,
  readingWithoutFurigana,
  pitch,
  partOfSpeech,
  conjugationsPath
}: {
  ruby: RubySegment[]
  reading: string
  romaji: string | null
  readingWithoutFurigana: string | null
  pitch: PitchAccentData | null
  partOfSpeech: string
  /** The conjugation table's page; null when the word has none. */
  conjugationsPath: string | null
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1" data-headline>
            <HeadwordRuby segments={ruby} className="text-5xl font-medium leading-tight" />
            <HeadlineAids romaji={romaji} readingWithoutFurigana={readingWithoutFurigana} />
          </div>
          {pitch ? (
            <PitchAccent pitch={pitch} reading={reading} />
          ) : (
            <PronounceButton text={reading} label={`Pronounce ${reading}`} />
          )}
        </div>
        {conjugationsPath ? (
          <>
            <Separator />
            <ConjugationsLink partOfSpeech={partOfSpeech} href={conjugationsPath} />
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
