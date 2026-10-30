import { wordExample } from '@zenbu/dictionary-core/detail/examples'
import { meaningActions } from '@zenbu/dictionary-core/detail/meaning-actions'
import type { WordRows } from '@zenbu/dictionary-core/detail/rows'
import { wordDetail } from '@zenbu/dictionary-core/detail/word'
import { ConjugationTableContent } from '@zenbu/ui/dictionary/conjugations'
import { MeaningExample } from '@zenbu/ui/dictionary/example-list'
import { Sheet } from '@zenbu/ui/dictionary/sheet'
import { WordHeader } from '@zenbu/ui/dictionary/word-header'
import { WordSections } from '@zenbu/ui/dictionary/word-sections'
import { useCallback, useMemo, useState } from 'react'
import type { Settings } from '../shared/settings'
import type { OpenEntry } from './entry-page'
import { PagedExamples } from './examples'
import { wordDetailLabels } from './labels'
import { answered, type WordLookups } from './lookups'
import { MeaningWithMenu } from './meaning-menu'
import { useNotices } from './notice'
import { ReadingAids } from './reading-aids'
import { shownConjugations, shownWordSections } from './shown'
import { useWordLinks } from './word-links'
import { WordShare } from './word-share'

const examplesAnchor = 'examples'
const noLearnerPrompt = () => null

export function WordDetailView({
  rows,
  settings,
  open,
  lookups
}: {
  rows: WordRows
  settings: Settings
  open: OpenEntry
  lookups: WordLookups
}) {
  const detail = useMemo(() => wordDetail(rows), [rows])
  const table = useMemo(
    () => (detail.conjugations ? shownConjugations(detail.conjugations) : null),
    [detail]
  )
  const [conjugationsOpen, setConjugationsOpen] = useState(false)
  const renderWordLink = useWordLinks(open, lookups.resolveWord)
  const { notify } = useNotices()
  const actions = useMemo(
    () =>
      new Map(
        detail.senses.map(sense => [
          sense.number,
          meaningActions({ meaning: sense.meaning, glosses: [], noteText: sense.noteText })
        ])
      ),
    [detail]
  )
  const loadExamples = useCallback(
    async (from: number) =>
      (await answered(lookups.lookUpWordExamples(detail.entSeq, from)))?.rows.map(wordExample) ??
      null,
    [lookups, detail.entSeq]
  )
  const exampleActions = { renderWordLink, onUnsupported: notify }
  return (
    <>
      <div className="flex justify-end">
        <WordShare word={detail} />
      </div>
      <WordHeader
        headword={detail.headword}
        ruby={detail.ruby}
        reading={detail.reading}
        pronounce={detail.pronounce}
        pitch={detail.pitch}
        partOfSpeech={detail.partOfSpeechRow}
        conjugations={table !== null}
        text={wordDetailLabels}
        onUnsupported={notify}
        onOpenConjugations={() => setConjugationsOpen(true)}
        headwordSize="panel"
      />
      <WordSections
        word={shownWordSections(detail, settings['frequencyDictionaries.chosen'])}
        lang={wordDetailLabels.lang}
        text={wordDetailLabels}
        renderWordLink={renderWordLink}
        linksKanjiWithoutDetails
        renderMeaning={(sense, meaning) => {
          const senseActions = actions.get(sense.number)
          return senseActions ? (
            <MeaningWithMenu number={sense.number} actions={senseActions} meaning={meaning} />
          ) : (
            meaning
          )
        }}
        renderMeaningExample={(example, meaning) => (
          <MeaningExample
            example={example}
            meaning={meaning}
            lang={wordDetailLabels.lang}
            text={wordDetailLabels}
            {...exampleActions}
          />
        )}
        kanjiActions={noLearnerPrompt}
        kanjiLearnerPrompt={() => noLearnerPrompt}
        learnerPrompt={noLearnerPrompt}
        conjugations={null}
        examples={
          detail.exampleCount ? (
            <PagedExamples
              initial={detail.examples}
              listed={detail.exampleCount.listed}
              load={loadExamples}
              {...exampleActions}
            />
          ) : null
        }
        examplesAnchor={examplesAnchor}
      />
      {table ? (
        <Sheet
          open={conjugationsOpen}
          onOpenChange={setConjugationsOpen}
          title={table.title}
          done={wordDetailLabels.frequency.done}
        >
          <ReadingAids settings={settings} className="pb-4">
            <ConjugationTableContent
              conjugations={table}
              lang={wordDetailLabels.lang}
              text={wordDetailLabels}
              {...exampleActions}
              openForm={row => {
                setConjugationsOpen(false)
                open({ page: 'form', form: row.surface })
              }}
            />
          </ReadingAids>
        </Sheet>
      ) : null}
    </>
  )
}
