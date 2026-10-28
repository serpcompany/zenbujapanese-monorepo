import { Button } from '@zenbu/ui/components/button'
import { ButtonGroup } from '@zenbu/ui/components/button-group'
import { Input } from '@zenbu/ui/components/input'
import { type FormEvent, useCallback, useState } from 'react'
import { type Lookup, type SearchAnswer, searchDictionary } from '../shared/dictionary'
import { useSettings } from '../shared/use-settings'
import type { PanelTabProps } from '../side-panel/route'
import { useLookup } from '../word-detail/lookups'
import { UnansweredLookup } from '../word-detail/page-states'
import { ReadingAids } from '../word-detail/reading-aids'
import { lookUpLabels } from './labels'
import { SearchResults } from './search-results'

type Search = (query: string) => Lookup<SearchAnswer>

type Asked = { query: string; key: number }

type ResultsProps = Pick<PanelTabProps, 'open'> & {
  search: Search
  refine(query: string): void
}

function Answer({ query, search, open, refine }: ResultsProps & { query: string }) {
  const lookup = useCallback(() => search(query), [search, query])
  const [result, retry] = useLookup(lookup)
  if (result.state !== 'answered') return <UnansweredLookup result={result} retry={retry} />
  return <SearchResults screen={result.answer.screen} open={open} refine={refine} />
}

function Searched({ asked, ...results }: ResultsProps & { asked: Asked }) {
  const settings = useSettings()
  if (!settings) return null
  return (
    <ReadingAids key={asked.key} settings={settings} className="flex flex-col gap-4">
      <Answer query={asked.query} {...results} />
    </ReadingAids>
  )
}

export function LookUpTab({
  open,
  search = searchDictionary
}: PanelTabProps & { search?: Search }) {
  const [text, setText] = useState('')
  const [asked, setAsked] = useState<Asked | null>(null)

  function ask(query: string) {
    setAsked(current => (query === '' ? null : { query, key: (current?.key ?? 0) + 1 }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    ask(text.trim())
  }

  function refine(query: string) {
    setText(query)
    ask(query)
  }

  return (
    <section data-look-up className="flex flex-col gap-4 p-4">
      <search>
        <form onSubmit={submit}>
          <ButtonGroup className="w-full">
            <Input
              type="text"
              enterKeyHint="search"
              aria-label={lookUpLabels.box}
              placeholder={lookUpLabels.placeholder}
              value={text}
              onChange={event => setText(event.target.value)}
              className="bg-background"
            />
            <Button type="submit" variant="outline">
              {lookUpLabels.search}
            </Button>
          </ButtonGroup>
        </form>
      </search>
      {asked && <Searched asked={asked} search={search} open={open} refine={refine} />}
    </section>
  )
}
