import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import { pronounceLabel } from '@zenbu/dictionary-core/detail/sections'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { Button } from '@zenbu/ui/components/button'
import { FrequencyBadges } from '@zenbu/ui/dictionary/frequency'
import { HeadwordRuby } from '@zenbu/ui/dictionary/headword-ruby'
import { PitchAccent } from '@zenbu/ui/dictionary/pitch-accent'
import { type OnUnsupported, PronounceButton } from '@zenbu/ui/dictionary/pronounce-button'
import { RomajiLine } from '@zenbu/ui/dictionary/reading-aid-lines'
import { Maximize2Icon } from 'lucide-react'
import { WordMenu } from '../word-saving/word-menu'
import { wordPopupLabels } from './labels'
import { cardBadges, cardPitch, cardRuby } from './shown'

export type CardActions = {
  share(card: WordCard): void
  addNote(card: WordCard): void
  openFullEntry(card: WordCard): void
  onUnsupported: OnUnsupported
}

function OpenFullEntry({ onSelect }: { onSelect(): void }) {
  const label = wordPopupLabels.openFullEntry
  return (
    <Button variant="outline" size="icon" aria-label={label} title={label} onClick={onSelect}>
      <Maximize2Icon />
    </Button>
  )
}

function Pronunciation({ card, onUnsupported }: { card: WordCard; onUnsupported: OnUnsupported }) {
  const pitch = cardPitch(card)
  const label = pronounceLabel(card.reading)
  const text = wordPopupLabels.pronounce
  if (!pitch) {
    return (
      <PronounceButton
        text={card.reading}
        label={label}
        unsupported={text.unsupported}
        onUnsupported={onUnsupported}
      />
    )
  }
  return (
    <PitchAccent
      pitch={pitch}
      reading={card.reading}
      pronounce={label}
      spoken={pitch.spoken}
      text={text}
      onUnsupported={onUnsupported}
    />
  )
}

export function WordCardView({
  card,
  romaji,
  frequency,
  actions
}: {
  card: WordCard
  romaji: string | null
  frequency: readonly string[]
  actions: CardActions
}) {
  const labels = wordPopupLabels.share
  return (
    <div className="flex flex-col gap-3" data-word-card={card.entSeq}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 aria-label={card.headword} data-headword>
            <HeadwordRuby
              segments={cardRuby(card)}
              readingsOutsideText
              className="block text-3xl font-medium leading-tight"
            />
          </h2>
          <RomajiLine romaji={romaji} className="text-sm text-muted-foreground" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <WordMenu
            word={{
              item: card.languageReferenceID,
              headword: card.headword,
              reading: card.reading
            }}
            share={{
              label: fill(labels.share, { name: card.headword }),
              onSelect: () => actions.share(card)
            }}
            moreActions={fill(labels.moreActions, { name: card.headword })}
            addNote={() => actions.addNote(card)}
          />
          <OpenFullEntry onSelect={() => actions.openFullEntry(card)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-pronunciation>
        <Pronunciation card={card} onUnsupported={actions.onUnsupported} />
      </div>
      <FrequencyBadges frequency={cardBadges(card, frequency)} />
      {card.partOfSpeech ? (
        <p className="text-sm text-muted-foreground" data-part-of-speech>
          {card.partOfSpeech}
        </p>
      ) : null}
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm" lang={wordPopupLabels.lang}>
        {card.meanings.map((sense, index) => (
          <li key={`${index}-${sense.meaning}`} data-meaning>
            {sense.meaning}
          </li>
        ))}
      </ol>
    </div>
  )
}
