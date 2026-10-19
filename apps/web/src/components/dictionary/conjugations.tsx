'use client'

import type { ConjugationMode } from '@zenbu/dictionary-core/detail/conjugation'
import { graphemes } from '@zenbu/dictionary-core/detail/text'
import { ChevronRightIcon, EqualIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PageExample } from '@/lib/dictionary/page-example'
import type {
  ConjugationsText,
  ShownConjugationRow,
  ShownConjugations
} from '@/lib/dictionary/screen-text'
import type { Locale } from '@/lib/i18n/config'
import { fill } from '@/lib/i18n/format'
import { accent } from './accent'
import { Disclosure, DisclosureSection } from './disclosure'
import { ExampleList } from './example-list'
import { HeadwordRuby } from './headword-ruby'
import { PronounceButton } from './pronounce-button'

const conjugationsAnchor = 'conjugations'

function EndingText({ surface, ending }: { surface: string; ending: string }) {
  if (!ending || !surface.endsWith(ending)) return surface
  const characters = graphemes(surface)
  const stem = characters.slice(0, characters.length - graphemes(ending).length).join('')
  return (
    <>
      {stem}
      <span className={accent} data-ending>
        {ending}
      </span>
    </>
  )
}

export function ConjugatedFormContent({
  row,
  unsupported
}: {
  row: ShownConjugationRow
  unsupported: string
}) {
  return (
    <div className="flex flex-col gap-4" data-conjugated-form={row.kind}>
      <p className="text-lg" data-conjugation-explanation>
        {row.explanation}
      </p>
      {row.sharedSpelling ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground" data-shared-spelling>
          <EqualIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {row.sharedSpelling}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <HeadwordRuby
          segments={row.ruby}
          highlightedEnding={row.ending}
          className="text-4xl font-medium leading-tight"
        />
        <PronounceButton text={row.reading} label={row.pronounce} unsupported={unsupported} />
      </div>
    </div>
  )
}

type FormExampleLabels = ShownConjugations['examples']

export function FormExampleList({
  examples,
  labels,
  locale,
  text
}: {
  examples: PageExample[]
  labels: FormExampleLabels
  locale: Locale
  text: ConjugationsText
}) {
  return examples.length > 0 ? (
    <ExampleList
      initial={examples}
      listed={examples.length}
      path={null}
      locale={locale}
      text={text}
    />
  ) : (
    <p className="text-sm text-muted-foreground" data-no-form-examples>
      {labels.empty}
    </p>
  )
}

type LoadedExamples =
  | { state: 'loading' }
  | { state: 'loaded'; examples: PageExample[] }
  | { state: 'failed' }

function FormExamples({
  surface,
  labels,
  locale,
  text
}: {
  surface: string
  labels: FormExampleLabels
  locale: Locale
  text: ConjugationsText
}) {
  const [loaded, setLoaded] = useState<LoadedExamples>({ state: 'loading' })
  useEffect(() => {
    let current = true
    setLoaded({ state: 'loading' })
    fetch(`/dictionary/conjugations/${encodeURIComponent(surface)}.json`)
      .then(async response => {
        if (!response.ok) throw new Error(`${response.status}`)
        const { examples } = (await response.json()) as { examples: PageExample[] }
        if (current) setLoaded({ state: 'loaded', examples })
      })
      .catch(() => {
        if (current) setLoaded({ state: 'failed' })
      })
    return () => {
      current = false
    }
  }, [surface])
  return (
    <section className="flex flex-col gap-3" data-conjugation-examples={loaded.state}>
      <h4 className="text-sm font-medium text-muted-foreground">{labels.title}</h4>
      {loaded.state === 'loading' ? (
        <p className="text-sm text-muted-foreground">{text.conjugations.loading}</p>
      ) : loaded.state === 'failed' ? (
        <p className="text-sm text-muted-foreground">{text.conjugations.failed}</p>
      ) : (
        <FormExampleList examples={loaded.examples} labels={labels} locale={locale} text={text} />
      )}
    </section>
  )
}

function ConjugatedFormDisclosure({
  row,
  labels,
  locale,
  text
}: {
  row: ShownConjugationRow
  labels: FormExampleLabels
  locale: Locale
  text: ConjugationsText
}) {
  return (
    <Disclosure
      data-conjugation-row={row.kind}
      label={fill(text.conjugations.rowLabel, {
        title: row.title,
        surface: row.surface,
        reading: row.reading
      })}
      buttonClassName="px-2 py-2"
      summary={
        <>
          <span className="text-muted-foreground">{row.title}</span>
          <span lang="ja" className="ml-auto text-xl" data-conjugation-surface>
            {row.rowFurigana ? (
              <HeadwordRuby
                segments={row.ruby}
                highlightedEnding={row.ending}
                highlightsKanji={false}
              />
            ) : (
              <EndingText surface={row.surface} ending={row.ending} />
            )}
          </span>
        </>
      }
    >
      {opened => (
        <div className="flex flex-col gap-4 px-2 pt-2 pb-4">
          <ConjugatedFormContent row={row} unsupported={text.pronounce.unsupported} />
          {opened ? (
            <FormExamples surface={row.surface} labels={labels} locale={locale} text={text} />
          ) : null}
        </div>
      )}
    </Disclosure>
  )
}

export function ConjugationTableContent({
  conjugations,
  locale,
  text
}: {
  conjugations: ShownConjugations
  locale: Locale
  text: ConjugationsText
}) {
  const [mode, setMode] = useState<ConjugationMode>('Plain')
  return (
    <div className="flex flex-col gap-4" data-conjugation-table>
      <p
        className={`self-start rounded-md bg-blue-600/10 px-2 py-1 text-xs ${accent}`}
        data-conjugation-rule
      >
        {conjugations.rule}
      </p>
      {conjugations.modes.length > 1 ? (
        <Tabs value={mode} onValueChange={value => setMode(value as ConjugationMode)}>
          <TabsList className="w-full" aria-label={text.conjugations.modeLabel}>
            {conjugations.modes.map(option => (
              <TabsTrigger
                key={option.mode}
                value={option.mode}
                data-conjugation-mode={option.mode}
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      {conjugations.modes.map(({ mode: option }) => (
        <ul
          key={option}
          hidden={option !== mode}
          className="-mx-2 flex flex-col"
          data-conjugation-rows={option}
        >
          {conjugations.rows[option].map(row => (
            <li key={row.kind}>
              <ConjugatedFormDisclosure
                row={row}
                labels={conjugations.examples}
                locale={locale}
                text={text}
              />
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

export function ConjugationsSection({
  conjugations,
  locale,
  text
}: {
  conjugations: ShownConjugations
  locale: Locale
  text: ConjugationsText
}) {
  return (
    <DisclosureSection id={conjugationsAnchor} title={conjugations.title}>
      <ConjugationTableContent conjugations={conjugations} locale={locale} text={text} />
    </DisclosureSection>
  )
}

export function ConjugationsLink({ label, opens }: { label: string; opens: string }) {
  const href = `#${conjugationsAnchor}`
  return (
    <a
      href={href}
      data-opens-conjugations
      className="-mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
      onClick={() => {
        if (window.location.hash === href) window.dispatchEvent(new HashChangeEvent('hashchange'))
      }}
    >
      <span>{label}</span>
      <span className="sr-only">{opens}</span>
      <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
    </a>
  )
}
