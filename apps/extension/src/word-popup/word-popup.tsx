import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { Button } from '@zenbu/ui/components/button'
import { ChevronLeftIcon } from 'lucide-react'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import type { Settings } from '../shared/settings'
import { wordAddress } from '../shared/word-address'
import type { EntryPage } from '../word-detail/entry-page'
import { FullEntry } from '../word-detail/full-entry'
import type { Notices } from '../word-detail/notice'
import { copyText, type Sharing } from './copy'
import { wordPopupLabels } from './labels'
import { shareText } from './shown'
import { type Looked, useCards, type WordLookUp } from './use-cards'
import { type CardActions, WordCardView } from './word-card-view'

export type WordPopupProps = {
  text: string
  ids: readonly string[]
  lookUp: WordLookUp
  settings: Settings
  sharing?: Sharing
}

const dismissed = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const labels = wordPopupLabels

const frameClass =
  'flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none'

const cardClass = `${frameClass} max-h-[min(32rem,calc(100vh-1rem))] gap-3 overflow-y-auto p-4`

const expandedClass = `${frameClass} h-[calc(100vh-1rem)] overflow-hidden`

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
): EntryPage {
  if (ids.length < 2) return { page: 'word', entSeq: card.entSeq }
  const entries = ids.flatMap(id => {
    const looked = cards[id]
    return looked?.type === 'card' ? [looked.card.entSeq] : []
  })
  return { page: 'word', entSeq: card.entSeq, entries }
}

function usePopupNotices(frame: RefObject<HTMLDivElement | null>, sharing?: Sharing) {
  const [notice, setNotice] = useState<string | null>(null)
  const notices = useMemo<Notices>(
    () => ({
      notify(message, clearWhen) {
        setNotice(message)
        clearWhen?.(() => setNotice(shown => (shown === message ? null : shown)))
      },
      async copy(text, copied) {
        const root = frame.current?.getRootNode() ?? document
        setNotice((await copyText(text, root, sharing)) ? copied : labels.copyFailed)
      }
    }),
    [frame, sharing]
  )
  return { notice, notices }
}

export function WordPopup({ text, ids, lookUp, settings, sharing }: WordPopupProps) {
  const cards = useCards(ids, lookUp)
  const [chosen, setChosen] = useState<string | null>(ids.length === 1 ? ids[0] : null)
  const [expanded, setExpanded] = useState<EntryPage | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const { notice, notices } = usePopupNotices(frame, sharing)
  const looked = chosen ? cards[chosen] : undefined
  const card = looked?.type === 'card' ? looked.card : null
  useEffect(() => {
    if (!expanded) frame.current?.focus({ preventScroll: true })
  }, [expanded])
  const copyLink = (shown: WordCard) =>
    void notices.copy(wordAddress(shown), labels.share.linkCopied)
  const actions: CardActions = {
    copyLink,
    share(shown) {
      const share = sharing?.share ?? navigator.share?.bind(navigator)
      if (!share) return void copyLink(shown)
      share({ title: shown.headword, text: shareText(shown), url: wordAddress(shown) }).catch(
        (error: unknown) => {
          if (!dismissed(error)) void copyLink(shown)
        }
      )
    },
    openFullEntry: shown => setExpanded(entryPage(shown, ids, cards)),
    onUnsupported: notices.notify
  }
  const name = card ? card.headword : text
  const label = fill(chosen ? labels.word : labels.choose, { name })
  if (expanded) {
    return (
      <div
        ref={frame}
        role="dialog"
        tabIndex={-1}
        aria-label={label}
        data-word-popup
        data-expanded
        className={expandedClass}
      >
        <FullEntry
          first={expanded}
          settings={settings}
          notices={notices}
          backLabel={labels.back}
          back={() => setExpanded(null)}
        />
        {notice ? (
          <output className="block border-t px-4 py-2 text-sm text-muted-foreground" data-notice>
            {notice}
          </output>
        ) : null}
      </div>
    )
  }
  return (
    <div
      ref={frame}
      role="dialog"
      tabIndex={-1}
      aria-label={label}
      data-word-popup
      className={cardClass}
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
          romaji={settings['readingAids.romaji'] && looked?.type === 'card' ? looked.romaji : null}
          frequency={settings['frequencyDictionaries.chosen']}
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
