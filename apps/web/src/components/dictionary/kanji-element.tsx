import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent } from '@/components/ui/item'
import {
  appSectionTitles,
  type ElementSection,
  type LinkedElementKanji,
  type LinkedKanjiElementDetail,
  sectionTitle
} from '@/lib/dictionary/detail/element'
import { kanjiElementPath } from '@/lib/dictionary/urls'
import { Section } from './section'

// The kanji element page, as the app's element screen (KanjiElementDetailView.swift) shows it:
// the glyph and its meanings, then its alternative forms, what it contributes, its linked
// on-readings, the element as a kanji of its own, every kanji containing it, and its sources.
// Each section shows only when it has something to show, in the app's order, titled in sentence
// case where the app writes capitals. Each kanji opens its kanji page, and each alternative form
// its own element page. The app's title is "Element"; the page's heading says which.

/** `KanjiContributionRow`: the kanji, up to three meanings, and its on-readings. */
function KanjiRow({ kanji }: { kanji: LinkedElementKanji }) {
  const content = (
    <>
      <span lang="ja" className="min-w-16 text-center text-5xl font-light leading-none">
        {kanji.character}
      </span>
      <ItemContent className="gap-1">
        {kanji.meanings ? (
          <p className="line-clamp-2" data-element-kanji-meanings>
            {kanji.meanings}
          </p>
        ) : null}
        {kanji.readings ? (
          <p lang="ja" className="text-xs text-muted-foreground" data-element-kanji-readings>
            {kanji.readings}
          </p>
        ) : null}
      </ItemContent>
      {kanji.path ? (
        <ItemActions>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </ItemActions>
      ) : null}
    </>
  )
  // The app returns to the kanji a learner opened from the list; the browser's Back does.
  return kanji.path ? (
    <Item data-element-kanji={kanji.character} render={<Link href={kanji.path} />}>
      {content}
    </Item>
  ) : (
    <Item data-element-kanji={kanji.character}>{content}</Item>
  )
}

function ElementSectionCard({
  section,
  children
}: {
  section: ElementSection
  children: ReactNode
}) {
  return (
    <div data-element-section={section} className="contents">
      <Section title={sectionTitle(appSectionTitles[section])}>{children}</Section>
    </div>
  )
}

export function KanjiElementContent({ element }: { element: LinkedKanjiElementDetail }) {
  const shows = (section: ElementSection) => element.sections.includes(section)
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Element <span lang="ja">{element.glyph}</span>
        </h1>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-2 text-center">
          <span lang="ja" className="text-9xl font-light leading-none" data-element-glyph>
            {element.glyph}
          </span>
          {element.meanings ? (
            <p className="text-xl font-semibold" data-element-meanings>
              {element.meanings}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {shows('alternativeForms') ? (
        <ElementSectionCard section="alternativeForms">
          <ul className="flex flex-wrap gap-3">
            {element.alternatives.map(glyph => (
              <li key={glyph}>
                <Link
                  href={kanjiElementPath(glyph)}
                  lang="ja"
                  aria-label={`Alternative element ${glyph}`}
                  className="grid size-14 place-items-center rounded-lg bg-muted text-3xl hover:bg-muted/70"
                  data-element-alternative={glyph}
                >
                  {glyph}
                </Link>
              </li>
            ))}
          </ul>
        </ElementSectionCard>
      ) : null}

      {shows('meaningStructure') ? (
        <ElementSectionCard section="meaningStructure">
          <p data-element-text>{element.meaningExplanation}</p>
        </ElementSectionCard>
      ) : null}

      {shows('soundPatterns') ? (
        <ElementSectionCard section="soundPatterns">
          <p data-element-text>{element.soundPatterns}</p>
        </ElementSectionCard>
      ) : null}

      {shows('standaloneKanji') && element.standaloneKanji ? (
        <ElementSectionCard section="standaloneKanji">
          <div className="-mx-3 flex flex-col">
            <KanjiRow kanji={element.standaloneKanji} />
          </div>
        </ElementSectionCard>
      ) : null}

      {shows('containingKanji') ? (
        <ElementSectionCard section="containingKanji">
          <div className="-mx-3 flex flex-col">
            {element.containingKanji.map(kanji => (
              <KanjiRow key={kanji.character} kanji={kanji} />
            ))}
          </div>
        </ElementSectionCard>
      ) : null}

      <ElementSectionCard section="source">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">Structure</dt>
          <dd className="text-right break-all" data-element-structure-source>
            {element.structureSource}
          </dd>
          <dt className="text-muted-foreground">Meanings and readings</dt>
          <dd className="text-right break-all" data-element-metadata-source>
            {element.metadataSource}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground" data-element-source-note>
          {element.sourceNote}
        </p>
      </ElementSectionCard>
    </>
  )
}
