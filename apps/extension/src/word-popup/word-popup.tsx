import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { Button } from '@zenbu/ui/components/button'
import { ChevronLeftIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PanelPage } from '../side-panel/route'
import { copyText, type Sharing } from './copy'
import { wordPopupLabels } from './labels'
import { shareText, wordAddress } from './shown'
import { type Looked, useCards, type WordLookUp } from './use-cards'
import { type CardActions, WordCardView } from './word-card-view'

export type WordPopupProps = {
  text: string
  ids: readonly string[]
  lookUp: WordLookUp
  frequency: readonly string[]
  romaji: boolean
  openFullEntry(page: PanelPage): void
  sharing?: Sharing
}

const dismissed = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const labels = wordPopupLabels

function Status({ looked }: { looked: Looked | undefined }) {
  const message =
    looked?.type === 'failed'
      ? labels.failed
      : looked?.type === 'not-found'
        ? labels.notFound
        : labels.loading
  return <output className="block text-sm text-muted-foreground">{message}</output>
}

function Choice({
  text,
  ids,
  cards,
  choose
}: {
  text: string
  ids: readonly string[]
  cards: Record<string, Looked>
  choose(id: string): void
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-medium">{fill(labels.choose, { name: text })}</h2>
      <p className="text-sm text-muted-foreground">{labels.chooseHint}</p>
      <ul className="flex flex-col gap-1.5">
        {ids.map(id => {
          const looked = cards[id]
          if (looked?.type !== 'card') return null
          const { card } = looked
          return (
            <li key={id}>
              <button
                type="button"
                data-choice={card.entSeq}
                onClick={() => choose(id)}
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border border-border px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              >
                <span lang="ja" className="text-base">
                  {card.headword}
                  {card.reading === card.headword ? null : `【${card.reading}】`}
                </span>
                {card.partOfSpeech ? (
                  <span className="text-xs text-muted-foreground">{card.partOfSpeech}</span>
                ) : null}
                <span className="line-clamp-2 text-sm" lang={labels.lang}>
                  {card.meanings
                    .slice(0, 2)
                    .map(sense => sense.meaning)
                    .join('; ')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {ids.some(id => !cards[id]) ? (
        <Status looked={undefined} />
      ) : ids.some(id => cards[id]?.type === 'card') ? null : (
        <Status looked={cards[ids[0]]} />
      )}
    </div>
  )
}

function entryPage(
  card: WordCard,
  ids: readonly string[],
  cards: Record<string, Looked>
): PanelPage {
  if (ids.length < 2) return { page: 'word', entSeq: card.entSeq }
  const entries = ids.flatMap(id => {
    const looked = cards[id]
    return looked?.type === 'card' ? [looked.card.entSeq] : []
  })
  return { page: 'word', entSeq: card.entSeq, entries }
}

export function WordPopup({
  text,
  ids,
  lookUp,
  frequency,
  romaji,
  openFullEntry,
  sharing
}: WordPopupProps) {
  const cards = useCards(ids, lookUp)
  const [chosen, setChosen] = useState<string | null>(ids.length === 1 ? ids[0] : null)
  const [notice, setNotice] = useState<string | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const looked = chosen ? cards[chosen] : undefined
  const card = looked?.type === 'card' ? looked.card : null
  useEffect(() => {
    frame.current?.focus({ preventScroll: true })
  }, [])
  const copyLink = async (shown: WordCard) => {
    const root = frame.current?.getRootNode() ?? document
    const copied = await copyText(wordAddress(shown), root, sharing)
    setNotice(copied ? labels.share.linkCopied : labels.copyFailed)
  }
  const actions: CardActions = {
    copyLink: shown => void copyLink(shown),
    share(shown) {
      const share = sharing?.share ?? navigator.share?.bind(navigator)
      if (!share) return void copyLink(shown)
      share({ title: shown.headword, text: shareText(shown), url: wordAddress(shown) }).catch(
        (error: unknown) => {
          if (!dismissed(error)) void copyLink(shown)
        }
      )
    },
    openFullEntry: shown => openFullEntry(entryPage(shown, ids, cards)),
    onUnsupported(message, clearWhen) {
      setNotice(message)
      clearWhen(() => setNotice(shown => (shown === message ? null : shown)))
    }
  }
  const name = card ? card.headword : text
  return (
    <div
      ref={frame}
      role="dialog"
      tabIndex={-1}
      aria-label={fill(chosen ? labels.word : labels.choose, { name })}
      data-word-popup
      className="flex max-h-[min(32rem,calc(100vh-1rem))] w-[22rem] max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none"
    >
      {chosen && ids.length > 1 ? (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setChosen(null)}>
            <ChevronLeftIcon />
            {labels.back}
          </Button>
        </div>
      ) : null}
      {chosen === null ? (
        <Choice text={text} ids={ids} cards={cards} choose={setChosen} />
      ) : card ? (
        <WordCardView
          card={card}
          romaji={romaji && looked?.type === 'card' ? looked.romaji : null}
          frequency={frequency}
          actions={actions}
        />
      ) : (
        <Status looked={looked} />
      )}
      {notice ? (
        <output className="block text-sm text-muted-foreground" data-notice>
          {notice}
        </output>
      ) : null}
    </div>
  )
}
