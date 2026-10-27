'use client'

import { type RadicalFile, RadicalLookup } from '@zenbu/dictionary-core/search/radicals'
import Link from 'next/link'
import { type MouseEvent, useMemo, useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  closedRadicalSections,
  keepClosedRadicalSections,
  pickedKanjiPath,
  radicalsPath,
  strokeSection
} from '@/lib/dictionary/radical-input'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'

type RadicalText = Dictionary['searchForm']['radicals']

export async function radicalLookup(): Promise<RadicalLookup> {
  const response = await fetch(radicalsPath)
  if (!response.ok) throw new Error(`${radicalsPath} answered ${response.status}`)
  return new RadicalLookup((await response.json()) as RadicalFile)
}

const opensHere = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

function Candidates({
  candidates,
  boxText,
  locale,
  text,
  pick
}: {
  candidates: readonly string[]
  boxText: string
  locale: Locale
  text: RadicalText
  pick: (kanji: string) => void
}) {
  return (
    <div className="h-16 shrink-0 overflow-x-auto overflow-y-hidden rounded-lg border">
      {candidates.length === 0 ? (
        <p className="flex h-full items-center justify-center px-3 text-center text-muted-foreground">
          {text.prompt}
        </p>
      ) : (
        <ul aria-label={text.candidates} lang="ja" className="flex h-full w-max">
          {candidates.map(kanji => (
            <li key={kanji} className="h-full not-first:border-l">
              <Link
                href={localizedPath(pickedKanjiPath(boxText, kanji), locale)}
                prefetch={false}
                onClick={event => {
                  if (opensHere(event)) pick(kanji)
                }}
                className="flex h-full min-w-14 items-center justify-center px-2 text-2xl outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {kanji}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RadicalPanel({
  lookup,
  selected,
  toggle,
  boxText,
  locale,
  text,
  pick
}: {
  lookup: RadicalLookup
  selected: readonly string[]
  toggle: (radical: string) => void
  boxText: string
  locale: Locale
  text: RadicalText
  pick: (kanji: string) => void
}) {
  const panel = useMemo(() => lookup.panel(selected), [lookup, selected])
  const [closed, setClosed] = useState(closedRadicalSections)
  const shown = panel.groups.map(group => strokeSection(group.strokeCount))
  const rememberClosed = (open: string[]) => {
    const next = [
      ...closed.filter(section => !shown.includes(section)),
      ...shown.filter(section => !open.includes(section))
    ]
    setClosed(next)
    keepClosedRadicalSections(next)
  }
  return (
    <>
      <Candidates
        candidates={panel.candidates}
        boxText={boxText}
        locale={locale}
        text={text}
        pick={pick}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Accordion
          multiple
          value={shown.filter(section => !closed.includes(section))}
          onValueChange={rememberClosed}
        >
          {panel.groups.map(group => {
            const label = coreText(group.label, locale)
            const ids = group.radicals.map(radical => radical.id)
            return (
              <AccordionItem key={group.strokeCount} value={strokeSection(group.strokeCount)}>
                <AccordionTrigger>{label}</AccordionTrigger>
                <AccordionContent>
                  <ToggleGroup
                    multiple
                    aria-label={label}
                    value={ids.filter(id => selected.includes(id))}
                    onValueChange={pressed => {
                      const changed = ids.find(id => pressed.includes(id) !== selected.includes(id))
                      if (changed) toggle(changed)
                    }}
                    className="grid w-full grid-cols-5 sm:grid-cols-8"
                  >
                    {group.radicals.map(radical => (
                      <ToggleGroupItem
                        key={radical.id}
                        value={radical.id}
                        variant="outline"
                        size="lg"
                        aria-label={fill(text.radical, { glyph: radical.glyph })}
                        className="w-full"
                      >
                        <span lang="ja" className="text-xl">
                          {radical.glyph}
                        </span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </div>
    </>
  )
}
