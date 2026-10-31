import { kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import type { KanjiRows } from '@zenbu/dictionary-core/detail/rows'
import { KanjiDetails } from '@zenbu/ui/dictionary/kanji-details'
import { useCallback, useMemo } from 'react'
import type { KanjiAnswer } from '../shared/answers'
import type { EntryPage, OpenEntry } from './entry-page'
import { wordDetailLabels } from './labels'
import { dictionaryLookups, useLookup, type WordLookups } from './lookups'
import { type EntryPageProps, NotFound, UnansweredLookup } from './page-states'
import { shownKanjiDetails } from './shown'
import { useWordLinks } from './word-links'

type KanjiPage = Extract<EntryPage, { page: 'kanji' }>

const noLearnerPrompt = () => null
const strokesDownloading = (answer: KanjiAnswer) => answer.strokes === 'downloading'

function KanjiView({
  rows,
  downloading,
  open,
  lookups
}: {
  rows: KanjiRows
  downloading: boolean
  open: OpenEntry
  lookups: WordLookups
}) {
  const renderWordLink = useWordLinks(open, lookups.resolveWord)
  const kanji = useMemo(
    () => shownKanjiDetails(kanjiDetail(rows), !downloading),
    [rows, downloading]
  )
  return (
    <>
      {downloading ? (
        <p className="text-sm text-muted-foreground" data-strokes="downloading">
          {wordDetailLabels.strokes.downloading}
        </p>
      ) : null}
      <KanjiDetails
        kanji={kanji}
        lang={wordDetailLabels.lang}
        text={wordDetailLabels.chrome}
        renderWordLink={renderWordLink}
        actions={null}
        learnerPrompt={noLearnerPrompt}
      />
    </>
  )
}

export function KanjiDetailPage({
  page,
  open,
  lookups = dictionaryLookups
}: EntryPageProps<KanjiPage>) {
  const { lookUpKanji } = lookups
  const lookup = useCallback(() => lookUpKanji(page.character), [lookUpKanji, page.character])
  const [result, retry] = useLookup(lookup, strokesDownloading)
  if (result.state !== 'answered') return <UnansweredLookup result={result} retry={retry} />
  const { rows, strokes } = result.answer
  if (!rows) return <NotFound message={wordDetailLabels.lookup.kanjiNotFound} />
  return (
    <KanjiView rows={rows} downloading={strokes === 'downloading'} open={open} lookups={lookups} />
  )
}
