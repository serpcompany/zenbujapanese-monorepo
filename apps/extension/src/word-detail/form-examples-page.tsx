import {
  examplesTitle,
  formExample,
  noFormExamplesMessage
} from '@zenbu/dictionary-core/detail/examples'
import { pronounceLabel } from '@zenbu/dictionary-core/detail/sections'
import { PronounceButton } from '@zenbu/ui/dictionary/pronounce-button'
import { Section } from '@zenbu/ui/dictionary/section'
import { useCallback } from 'react'
import type { FormExamplesAnswer } from '../shared/answers'
import type { EntryPage, OpenEntry } from './entry-page'
import { PagedExamples } from './examples'
import { wordDetailLabels } from './labels'
import { answered, dictionaryLookups, useLookup, type WordLookups } from './lookups'
import { useNotices } from './notice'
import { type EntryPageProps, UnansweredLookup } from './page-states'
import { useWordLinks } from './word-links'

type FormPage = Extract<EntryPage, { page: 'form' }>

function FormExamplesView({
  form,
  answer,
  open,
  lookups
}: {
  form: string
  answer: FormExamplesAnswer
  open: OpenEntry
  lookups: WordLookups
}) {
  const renderWordLink = useWordLinks(open, lookups.resolveWord)
  const { notify } = useNotices()
  const { lookUpFormExamples } = lookups
  const load = useCallback(
    async (from: number) =>
      (await answered(lookUpFormExamples(form, from)))?.rows.map(formExample) ?? null,
    [lookUpFormExamples, form]
  )
  return (
    <>
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
    </>
  )
}

export function FormExamplesPage({
  page,
  open,
  lookups = dictionaryLookups
}: EntryPageProps<FormPage>) {
  const { lookUpFormExamples } = lookups
  const lookup = useCallback(
    () => lookUpFormExamples(page.form, 0),
    [lookUpFormExamples, page.form]
  )
  const [result, retry] = useLookup(lookup)
  if (result.state !== 'answered') return <UnansweredLookup result={result} retry={retry} />
  return <FormExamplesView form={page.form} answer={result.answer} open={open} lookups={lookups} />
}
