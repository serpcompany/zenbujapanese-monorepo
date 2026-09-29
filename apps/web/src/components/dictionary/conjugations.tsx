'use client'

import { ChevronRightIcon, EqualIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type ConjugationMode,
  type ConjugationRow,
  type Conjugations,
  sharedSpellingNote
} from '@/lib/dictionary/detail/conjugation'
import { noFormExamplesMessage } from '@/lib/dictionary/detail/examples'
import type { PitchAccent as PitchAccentData } from '@/lib/dictionary/detail/pitch'
import type { RubySegment } from '@/lib/dictionary/detail/ruby'
import { graphemes } from '@/lib/dictionary/detail/text'
import type { PageExample } from '@/lib/dictionary/page-example'
import { conjugatedFormPath, politeRegisterHash } from '@/lib/dictionary/urls'
import { ExampleList } from './example-list'
import { accent, HeadwordRuby } from './headword-ruby'
import { PitchAccent } from './pitch-accent'
import { PronounceButton } from './pronounce-button'
import { HeadlineAids, Romaji } from './reading-aid'

// The conjugation screens, as ConjugationsView.swift shows them. The table: the word with its
// reading, meaning, word class, and a one-line rule, a Plain/Polite control when both registers
// exist, and each form with its changed ending in the accent color. A form's screen
// (ConjugatedFormView): what the form means, whether another form shares its spelling, the form
// with furigana, its ending highlighted, and a speaker, then the Example Sentences that use it.
// The app pushes each as its own screen, so each has its own page: the table under the word's
// page, and each form under the table (urls.ts).

export interface ConjugationWord {
  ruby: RubySegment[]
  reading: string
  /** Under the headword with Romaji on. */
  romaji: string | null
  /** Under the headword with Furigana off. */
  readingWithoutFurigana: string | null
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

/**
 * ConjugationsView's list: the header, the register control, and a row per form, each opening its
 * form's page under `wordPath`, the word page's path.
 */
export function ConjugationTableContent({
  word,
  conjugations,
  mode,
  onModeChange,
  wordPath
}: {
  word: ConjugationWord
  conjugations: Conjugations
  mode: ConjugationMode
  onModeChange: (mode: ConjugationMode) => void
  wordPath: string
}) {
  return (
    <div className="flex flex-col gap-4" data-conjugation-table>
      <div className="flex flex-col gap-2" data-conjugation-header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1" data-headline>
            <HeadwordRuby segments={word.ruby} className="text-4xl font-medium leading-tight" />
            <HeadlineAids
              romaji={word.romaji}
              readingWithoutFurigana={word.readingWithoutFurigana}
            />
          </div>
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
        {conjugations.rows[mode].map(row => (
          <li key={row.kind}>
            <Link
              href={conjugatedFormPath(wordPath, mode, row.kind)}
              data-conjugation-row={row.kind}
              aria-label={`${row.title}, ${row.surface}, ${row.reading}`}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
            >
              <span className="text-muted-foreground">{row.title}</span>
              <span lang="ja" className="ml-auto text-xl" data-conjugation-surface>
                {row.rowFurigana ? (
                  // A row with furigana is the app's JapaneseRubyText, with romaji under it.
                  <>
                    <HeadwordRuby
                      segments={row.ruby}
                      highlightedEnding={row.ending}
                      highlightsKanji={false}
                    />
                    <Romaji text={row.romaji} className="text-right" />
                  </>
                ) : (
                  <EndingText surface={row.surface} ending={row.ending} />
                )}
              </span>
              <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
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
        <div className="flex flex-col gap-1" data-headline>
          <HeadwordRuby
            segments={row.ruby}
            highlightedEnding={row.ending}
            className="text-4xl font-medium leading-tight"
          />
          <HeadlineAids romaji={row.romaji} readingWithoutFurigana={row.readingWithoutFurigana} />
        </div>
        <PronounceButton text={row.reading} label={`Pronounce ${row.reading}`} />
      </div>
    </div>
  )
}

/**
 * A form's Example Sentences, as ConjugatedFormView lists them: the first ones with the page, then
 * more as the list scrolls, each with the form's words accented; or the screen's empty state.
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

/** The part-of-speech row, which opens the word's conjugation table when it has one. */
export function ConjugationsLink({ partOfSpeech, href }: { partOfSpeech: string; href: string }) {
  return (
    <Link
      href={href}
      data-opens-conjugations
      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
    >
      <span>{partOfSpeech || 'Dictionary entry'}</span>
      <span className="sr-only">, shows conjugations</span>
      <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
    </Link>
  )
}
