import {
  examplesTitle,
  formExample,
  noFormExamplesMessage
} from '@zenbu/dictionary-core/detail/examples'
import { pronounceLabel } from '@zenbu/dictionary-core/detail/sections'
import { PronounceButton } from '@zenbu/ui/dictionary/pronounce-button'
import { Section } from '@zenbu/ui/dictionary/section'
import { useCallback } from 'react'
import type { FormExamplesAnswer } from '../shared/dictionary'
import type { Settings } from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import type { PanelPage, PanelPageProps } from '../side-panel/route'
import { PagedExamples } from './examples'
import { wordDetailLabels } from './labels'
import { answered, dictionaryLookups, useLookup, type WordLookups } from './lookups'
import { Notice, useNotice } from './notice'
import { UnansweredLookup } from './page-states'
import { ReadingAids } from './reading-aids'
import { useWordLinks } from './word-links'

type FormPage = Extract<PanelPage, { page: 'form' }>

function FormExamplesView({
  form,
  answer,
  settings,
  open,
  lookups
}: {
  form: string
  answer: FormExamplesAnswer
  settings: Settings
  open: (page: PanelPage) => void
  lookups: WordLookups
}) {
  const [notice, notify] = useNotice()
  const renderWordLink = useWordLinks(open, lookups.resolveWord, notify)
  const { lookUpFormExamples } = lookups
  const load = useCallback(
    async (from: number) =>
      (await answered(lookUpFormExamples(form, from)))?.rows.map(formExample) ?? null,
    [lookUpFormExamples, form]
  )
  return (
    <ReadingAids settings={settings} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 lang="ja" className="text-4xl font-medium">
          {form}
        </h1>
        <PronounceButton
          text={form}
          label={pronounceLabel(form)}
          unsupported={wordDetailLabels.pronounce.unsupported}
          onUnsupported={notify}
        />
      </div>
      <Notice notice={notice} />
      <Section title={examplesTitle}>
        {answer.rows.length > 0 ? (
          <PagedExamples
            initial={answer.rows.map(formExample)}
            listed={answer.listed}
            load={load}
            renderWordLink={renderWordLink}
            onUnsupported={notify}
          />
        ) : (
          <p className="text-muted-foreground" data-examples="none">
            {noFormExamplesMessage}
          </p>
        )}
      </Section>
    </ReadingAids>
  )
}

export function FormExamplesPage({
  page,
  open,
  lookups = dictionaryLookups
}: PanelPageProps<FormPage> & { lookups?: WordLookups }) {
  const settings = useSettings()
  const { lookUpFormExamples } = lookups
  const lookup = useCallback(
    () => lookUpFormExamples(page.form, 0),
    [lookUpFormExamples, page.form]
  )
  const [result, retry] = useLookup(lookup)
  if (!settings) return null
  if (result.state !== 'answered') return <UnansweredLookup result={result} retry={retry} />
  return (
    <FormExamplesView
      form={page.form}
      answer={result.answer}
      settings={settings}
      open={open}
      lookups={lookups}
    />
  )
}
