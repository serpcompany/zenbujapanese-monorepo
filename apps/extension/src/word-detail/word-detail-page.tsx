import type { WordRows } from '@zenbu/dictionary-core/detail/rows'
import { Tabs, TabsList, TabsTrigger } from '@zenbu/ui/components/tabs'
import { useCallback, useMemo, useState } from 'react'
import type { Lookup, NotReady, WordAnswer } from '../shared/dictionary'
import type { Failure } from '../shared/messages'
import type { Settings } from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import type { PanelPage, PanelPageProps } from '../side-panel/route'
import { wordDetailLabels } from './labels'
import { dictionaryLookups, useLookup, type WordLookups } from './lookups'
import { framed, NotFound, UnansweredLookup } from './page-states'
import { ReadingAids } from './reading-aids'
import { WordDetailView } from './word-detail-view'

type WordPage = Extract<PanelPage, { page: 'word' }>
type EntriesAnswer = { type: 'entries'; rows: WordRows[] }

const unanswered = (answer: WordAnswer | NotReady | Failure): answer is NotReady | Failure =>
  answer.type !== 'word'

async function lookUpEntries(
  entSeqs: readonly number[],
  lookUpWord: WordLookups['lookUpWord']
): Lookup<EntriesAnswer> {
  const answers = await Promise.all(entSeqs.map(entSeq => lookUpWord(entSeq)))
  const notAnswered = answers.find(unanswered)
  if (notAnswered) return notAnswered
  return {
    type: 'entries',
    rows: answers.flatMap(answer => (answer.type === 'word' && answer.rows ? [answer.rows] : []))
  }
}

type EntriesProps = {
  entSeqs: number[]
  first: number
  settings: Settings
  open: (page: PanelPage) => void
  lookups: WordLookups
}

function WordEntries({ entSeqs, first, settings, open, lookups }: EntriesProps) {
  const [chosen, setChosen] = useState(first)
  const { lookUpWord } = lookups
  const lookup = useCallback(() => lookUpEntries(entSeqs, lookUpWord), [entSeqs, lookUpWord])
  const [result, retry] = useLookup(lookup)
  if (result.state !== 'answered') return <UnansweredLookup result={result} retry={retry} />
  const { rows } = result.answer
  const shown = rows.find(entry => entry.entry.entSeq === chosen) ?? rows[0]
  if (!shown) return <NotFound message={wordDetailLabels.lookup.wordNotFound} />
  return (
    <ReadingAids settings={settings} className="flex flex-col gap-4">
      {rows.length > 1 ? (
        <Tabs value={shown.entry.entSeq} onValueChange={value => setChosen(Number(value))}>
          <TabsList aria-label={wordDetailLabels.entries}>
            {rows.map(({ entry }) => (
              <TabsTrigger
                key={entry.entSeq}
                value={entry.entSeq}
                lang="ja"
                data-entry={entry.entSeq}
              >
                {entry.reading}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      <WordDetailView
        key={shown.entry.entSeq}
        rows={shown}
        settings={settings}
        open={open}
        lookups={lookups}
      />
    </ReadingAids>
  )
}

function WordDetailContent({
  page,
  open,
  lookups = dictionaryLookups
}: PanelPageProps<WordPage> & { lookups?: WordLookups }) {
  const settings = useSettings()
  const entries = page.entries ?? []
  const key = entries.length > 1 ? entries.join() : String(page.entSeq)
  const entSeqs = useMemo(() => key.split(',').map(Number), [key])
  if (!settings) return null
  return (
    <WordEntries
      key={key}
      entSeqs={entSeqs}
      first={page.entSeq}
      settings={settings}
      open={open}
      lookups={lookups}
    />
  )
}

export const WordDetailPage = framed(WordDetailContent)
