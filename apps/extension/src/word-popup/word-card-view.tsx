import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import { pronounceLabel } from '@zenbu/dictionary-core/detail/sections'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { FrequencyBadges } from '@zenbu/ui/dictionary/frequency'
import { HeadwordRuby } from '@zenbu/ui/dictionary/headword-ruby'
import { PitchAccent } from '@zenbu/ui/dictionary/pitch-accent'
import { PronounceButton } from '@zenbu/ui/dictionary/pronounce-button'
import { RomajiLine } from '@zenbu/ui/dictionary/reading-aid-lines'
import { SavedItemActions } from '@zenbu/ui/dictionary/saved-item-actions'
import { LinkIcon } from 'lucide-react'
import { wordPopupLabels } from './labels'
import { cardBadges, cardPitch, cardRuby } from './shown'

export type CardActions = {
  share(card: WordCard): void
  copyLink(card: WordCard): void
  onUnsupported(message: string): void
}

function Pronunciation({
  card,
  onUnsupported
}: {
  card: WordCard
  onUnsupported(message: string): void
}) {
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
        <SavedItemActions
          share={{
            label: fill(labels.share, { name: card.headword }),
            onSelect: () => actions.share(card)
          }}
          moreActions={fill(labels.moreActions, { name: card.headword })}
          groups={[
            [
              {
                id: 'copyLink',
                icon: LinkIcon,
                label: labels.copyLink,
                onSelect: () => actions.copyLink(card)
              }
            ]
          ]}
        />
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
