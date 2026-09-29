'use client'

import { ChevronLeftIcon, ChevronRightIcon, EqualIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type ConjugationMode,
  type ConjugationRow,
  type Conjugations,
  sharedSpellingNote
} from '@/lib/dictionary/detail/conjugation'
import type { PitchAccent as PitchAccentData } from '@/lib/dictionary/detail/pitch'
import type { RubySegment } from '@/lib/dictionary/detail/ruby'
import { graphemes } from '@/lib/dictionary/detail/text'
import { accent, HeadwordRuby } from './headword-ruby'
import { PitchAccent } from './pitch-accent'
import { PronounceButton } from './pronounce-button'
import { Sheet } from './sheet'

// The conjugation table the part-of-speech row opens, as ConjugationsView.swift shows it: the
// word with its reading, meaning, word class, and a one-line rule, a Plain/Polite control when
// both registers exist, and each form with its changed ending in the accent color. Selecting a
// form opens its screen (ConjugatedFormView): what the form means, whether another form shares its
// spelling, and the form with furigana, its ending highlighted, and a speaker. The app pushes these
// screens; the website opens them in one sheet, with Back from a form to the table.

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

/** ConjugationsView's list: the header, the register control, and a row per form. */
export function ConjugationTableContent({
  word,
  conjugations,
  mode,
  onModeChange,
  onSelect
}: {
  word: ConjugationWord
  conjugations: Conjugations
  mode: ConjugationMode
  onModeChange: (mode: ConjugationMode) => void
  onSelect: (row: ConjugationRow) => void
}) {
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
        {conjugations.rows[mode].map(row => (
          <li key={row.kind}>
            <button
              type="button"
              data-conjugation-row={row.kind}
              aria-label={`${row.title}, ${row.surface}, ${row.reading}`}
              className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              onClick={() => onSelect(row)}
            >
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
            </button>
          </li>
        ))}
      </ul>
    </div>
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

/** The part-of-speech row, which opens the conjugation table when the word has one. */
export function ConjugationsButton({
  word,
  conjugations
}: {
  word: ConjugationWord
  conjugations: Conjugations
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
          <ConjugatedFormContent row={form} />
        ) : (
          <ConjugationTableContent
            word={word}
            conjugations={conjugations}
            mode={mode}
            onModeChange={setMode}
            onSelect={setForm}
          />
        )}
      </Sheet>
    </>
  )
}
