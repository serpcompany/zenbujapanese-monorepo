import { kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import type { KanjiRows } from '@zenbu/dictionary-core/detail/rows'
import { KanjiDetails } from '@zenbu/ui/dictionary/kanji-details'
import { useCallback, useMemo } from 'react'
import type { Settings } from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import type { PanelPage, PanelPageProps } from '../side-panel/route'
import { wordDetailLabels } from './labels'
import { dictionaryLookups, useLookup, type WordLookups } from './lookups'
import { Notice, useNotice } from './notice'
import { NotFound, UnansweredLookup } from './page-states'
import { ReadingAids } from './reading-aids'
import { shownKanjiDetails } from './shown'
import { useWordLinks } from './word-links'

type KanjiPage = Extract<PanelPage, { page: 'kanji' }>

const noLearnerPrompt = () => null

function KanjiView({
  rows,
  downloading,
  settings,
  open,
  lookups
}: {
  rows: KanjiRows
  downloading: boolean
  settings: Settings
  open: (page: PanelPage) => void
  lookups: WordLookups
}) {
  const [notice, notify] = useNotice()
  const renderWordLink = useWordLinks(open, lookups.resolveWord, notify)
  const kanji = useMemo(
    () => shownKanjiDetails(kanjiDetail(rows), !downloading),
    [rows, downloading]
  )
  return (
    <ReadingAids settings={settings} className="flex flex-col gap-4">
      <Notice notice={notice} />
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
    </ReadingAids>
  )
}

export function KanjiDetailPage({
  page,
  open,
  lookups = dictionaryLookups
}: PanelPageProps<KanjiPage> & { lookups?: WordLookups }) {
  const settings = useSettings()
  const { lookUpKanji } = lookups
  const lookup = useCallback(() => lookUpKanji(page.character), [lookUpKanji, page.character])
  const [result, retry] = useLookup(lookup)
  if (!settings) return null
  if (result.state !== 'answered') return <UnansweredLookup result={result} retry={retry} />
  const { rows, strokes } = result.answer
  if (!rows) return <NotFound message={wordDetailLabels.lookup.kanjiNotFound} />
  return (
    <KanjiView
      rows={rows}
      downloading={strokes === 'downloading'}
      settings={settings}
      open={open}
      lookups={lookups}
    />
  )
}
