import type { PitchAccent as PitchAccentData } from '@zenbu/dictionary-core/detail/pitch'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import type { ReactNode } from 'react'
import { Card, CardContent } from '../components/card'
import { Separator } from '../components/separator'
import { ConjugationsLink } from './conjugations'
import { HeadwordRuby } from './headword-ruby'
import { PitchAccent, type PronounceText } from './pitch-accent'
import { type OnUnsupported, PronounceButton } from './pronounce-button'
import { ReadingLine, RomajiLine } from './reading-aid-lines'

const headwordSizes = { page: 'text-5xl', panel: 'text-4xl' } as const

export function WordHeader({
  headword,
  ruby,
  reading,
  pronounce,
  pitch,
  partOfSpeech,
  conjugations,
  text,
  onUnsupported,
  onOpenConjugations,
  headwordSize = 'page',
  tag
}: {
  headword: string
  ruby: RubySegment[]
  reading: string
  pronounce: string
  pitch: PitchAccentData | null
  partOfSpeech: string
  conjugations: boolean
  text: { pronounce: PronounceText; conjugations: { showsConjugations: string } }
  onUnsupported: OnUnsupported
  onOpenConjugations?: () => void
  headwordSize?: keyof typeof headwordSizes
  tag?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 aria-label={headword}>
              <HeadwordRuby
                segments={ruby}
                readingsOutsideText
                className={`block ${headwordSizes[headwordSize]} font-medium leading-tight`}
              />
            </h1>
            <RomajiLine romaji={romaji(reading)} className="text-base" />
            {reading === headword ? null : <ReadingLine reading={reading} className="text-2xl" />}
            {tag}
          </div>
          {pitch ? (
            <PitchAccent
              pitch={pitch}
              reading={reading}
              pronounce={pronounce}
              spoken={pitch.spoken}
              text={text.pronounce}
              onUnsupported={onUnsupported}
            />
          ) : (
            <PronounceButton
              text={reading}
              label={pronounce}
              unsupported={text.pronounce.unsupported}
              onUnsupported={onUnsupported}
            />
          )}
        </div>
        {conjugations ? (
          <>
            <Separator />
            <ConjugationsLink
              label={partOfSpeech}
              opens={text.conjugations.showsConjugations}
              onOpen={onOpenConjugations}
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
