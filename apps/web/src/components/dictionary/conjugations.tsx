'use client'

import {
  type ConjugationMode,
  type ConjugationRow,
  type Conjugations,
  sharedSpellingNote
} from '@zenbu/dictionary-core/detail/conjugation'
import { noFormExamplesMessage } from '@zenbu/dictionary-core/detail/examples'
import type { PitchAccent as PitchAccentData } from '@zenbu/dictionary-core/detail/pitch'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { graphemes } from '@zenbu/dictionary-core/detail/text'
import { ChevronLeftIcon, ChevronRightIcon, EqualIcon } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PageExample } from '@/lib/dictionary/page-example'
import { conjugatedFormPath, conjugationsHref, politeRegisterHash } from '@/lib/dictionary/urls'
import { ExampleList } from './example-list'
import { accent, HeadwordRuby } from './headword-ruby'
import { PitchAccent } from './pitch-accent'
import { PronounceButton } from './pronounce-button'
import { Sheet } from './sheet'

// The conjugation screens, as ConjugationsView.swift shows them. The table: the word with its
// reading, meaning, word class, and a one-line rule, a Plain/Polite control when both registers
// exist, and each form with its changed ending in the accent color. A form's screen
// (ConjugatedFormView): what the form means, whether another form shares its spelling, the form
// with furigana, its ending highlighted, and a speaker, then the Example Sentences that use it.
// The website shows them two ways: in a sheet the word page's part-of-speech row opens, with Back
// from a form to the table, as the app pushes them; and as pages of their own, the table under
// the word's page and each form under the table (urls.ts), which the sheet links to and search
// engines index.

export interface ConjugationWord {
  ruby: RubySegment[]
  reading: string
  summary: string
  partOfSpeech: string
  pitch: PitchAccentData | null
}

/** A form's surface with its ending in the accent color, as the app's `highlightingEnding`. */
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

const rowClass =
  'flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none'

/**
 * ConjugationsView's list: the header, the register control, and a row per form. On the table's
 * page (`wordPath`, the word page's path) each row opens its form's page; in the sheet
 * (`onSelect`) it opens the form's screen there.
 */
export function ConjugationTableContent({
  word,
  conjugations,
  mode,
  onModeChange,
  onSelect,
  wordPath
}: {
  word: ConjugationWord
  conjugations: Conjugations
  mode: ConjugationMode
  onModeChange: (mode: ConjugationMode) => void
} & (
  | { onSelect: (row: ConjugationRow) => void; wordPath?: undefined }
  | { wordPath: string; onSelect?: undefined }
)) {
  return (
    <div className="flex flex-col gap-4" data-conjugation-table>
      <div className="flex flex-col gap-2" data-conjugation-header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <HeadwordRuby segments={word.ruby} className="text-4xl font-medium leading-tight" />
          {word.pitch ? (
            <PitchAccent pitch={word.pitch} reading={word.reading} />
          ) : (
            <PronounceButton text={word.reading} label={`Pronounce ${word.reading}`} />
          )}
        </div>
        <p className="text-muted-foreground" data-conjugation-summary>
          {word.summary}
        </p>
        {word.partOfSpeech ? <p>{word.partOfSpeech}</p> : null}
        <p
          className={`self-start rounded-md bg-blue-600/10 px-2 py-1 text-xs ${accent}`}
          data-conjugation-rule
        >
          {conjugations.rule}
        </p>
      </div>
      {conjugations.modes.length > 1 ? (
        <Tabs value={mode} onValueChange={value => onModeChange(value as ConjugationMode)}>
          <TabsList className="w-full" aria-label="Conjugation mode">
            {conjugations.modes.map(option => (
              <TabsTrigger key={option} value={option} data-conjugation-mode={option}>
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      <ul className="-mx-2 flex flex-col" data-conjugation-rows={mode}>
        {conjugations.rows[mode].map(row => {
          const content = (
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
              <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
            </>
          )
          const label = `${row.title}, ${row.surface}, ${row.reading}`
          return (
            <li key={row.kind}>
              {wordPath !== undefined ? (
                <Link
                  href={conjugatedFormPath(wordPath, mode, row.kind)}
                  data-conjugation-row={row.kind}
                  aria-label={label}
                  className={rowClass}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  data-conjugation-row={row.kind}
                  aria-label={label}
                  className={rowClass}
                  onClick={() => onSelect(row)}
                >
                  {content}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The conjugation table's page body: the table in the register the reader chose, which the
 * address keeps (`#polite`, urls.ts `conjugationsHref`), so returning from a Polite form shows
 * Polite again, as the app's Back does.
 */
export function ConjugationTable({
  word,
  conjugations,
  wordPath
}: {
  word: ConjugationWord
  conjugations: Conjugations
  wordPath: string
}) {
  const [mode, setMode] = useState<ConjugationMode>('Plain')
  useEffect(() => {
    if (window.location.hash === politeRegisterHash && conjugations.modes.includes('Polite')) {
      setMode('Polite')
    }
  }, [conjugations.modes])
  return (
    <ConjugationTableContent
      word={word}
      conjugations={conjugations}
      mode={mode}
      onModeChange={next => {
        setMode(next)
        const { pathname, search } = window.location
        // Null state: Next.js's router then adopts the new address as its own, rather than
        // restoring the previous one from the state it keeps.
        window.history.replaceState(
          null,
          '',
          `${pathname}${search}${next === 'Polite' ? politeRegisterHash : ''}`
        )
      }}
      wordPath={wordPath}
    />
  )
}

/** ConjugatedFormView: what the form means, a shared spelling, and the form itself. */
export function ConjugatedFormContent({ row }: { row: ConjugationRow }) {
  return (
    <div className="flex flex-col gap-4" data-conjugated-form={row.kind}>
      <p className="text-lg" data-conjugation-explanation>
        {row.explanation}
      </p>
      {row.sharedSpellings.length > 0 ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground" data-shared-spelling>
          <EqualIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {sharedSpellingNote(row.sharedSpellings)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <HeadwordRuby
          segments={row.ruby}
          highlightedEnding={row.ending}
          className="text-4xl font-medium leading-tight"
        />
        <PronounceButton text={row.reading} label={`Pronounce ${row.reading}`} />
      </div>
    </div>
  )
}

/**
 * A form's Example Sentences on its page, as ConjugatedFormView lists them: the first ones with
 * the page, then more as the list scrolls, each with the form's words accented; or the screen's
 * empty state.
 */
export function ConjugatedFormExamples({
  examples,
  listed,
  path
}: {
  examples: PageExample[]
  listed: number
  path: string
}) {
  return examples.length > 0 ? (
    <ExampleList initial={examples} listed={listed} path={path} />
  ) : (
    <p className="text-muted-foreground" data-no-form-examples>
      {noFormExamplesMessage}
    </p>
  )
}

type LoadedExamples =
  | { state: 'loading' }
  | { state: 'loaded'; examples: PageExample[] }
  | { state: 'failed' }

/**
 * A form's Example Sentences in the sheet: all of them, loaded when the form's screen opens
 * (src/app/dictionary/conjugations).
 */
function SheetFormExamples({ surface }: { surface: string }) {
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
      <h3 className="text-sm font-medium text-muted-foreground">Examples</h3>
      {loaded.state === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading examples</p>
      ) : loaded.state === 'failed' ? (
        <p className="text-sm text-muted-foreground">Examples couldn’t load. Try again later.</p>
      ) : loaded.examples.length === 0 ? (
        <p className="text-sm text-muted-foreground">{noFormExamplesMessage}</p>
      ) : (
        <ExampleList initial={loaded.examples} listed={loaded.examples.length} path={null} />
      )}
    </section>
  )
}

/** The sheet's link to what it shows as a page of its own. */
function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      data-conjugation-page-link
      className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </Link>
  )
}

/**
 * The part-of-speech row, which opens the conjugation table in a sheet when the word has one;
 * the sheet links the table and each form to its own page, under `wordPath`.
 */
export function ConjugationsButton({
  word,
  conjugations,
  wordPath
}: {
  word: ConjugationWord
  conjugations: Conjugations
  wordPath: string
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ConjugationMode>('Plain')
  const [form, setForm] = useState<ConjugationRow | null>(null)
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        data-opens-conjugations
        className="-mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
        onClick={() => {
          setMode('Plain')
          setForm(null)
          setOpen(true)
        }}
      >
        <span>{word.partOfSpeech || 'Dictionary entry'}</span>
        <span className="sr-only">, shows conjugations</span>
        <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        wide
        title={form ? form.title : 'Conjugations'}
        header={
          form ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to conjugations"
              onClick={() => setForm(null)}
            >
              <ChevronLeftIcon />
            </Button>
          ) : null
        }
      >
        {form ? (
          <div className="flex flex-col gap-4">
            <ConjugatedFormContent row={form} />
            <SheetFormExamples surface={form.surface} />
            <PageLink href={conjugatedFormPath(wordPath, mode, form.kind)}>
              Open this form’s page
            </PageLink>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ConjugationTableContent
              word={word}
              conjugations={conjugations}
              mode={mode}
              onModeChange={setMode}
              onSelect={setForm}
            />
            <PageLink href={conjugationsHref(`${wordPath}conjugations/`, mode)}>
              Open the conjugation table’s page
            </PageLink>
          </div>
        )}
      </Sheet>
    </>
  )
}
