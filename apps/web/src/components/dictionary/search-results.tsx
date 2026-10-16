import { exampleCountText } from '@zenbu/dictionary-core/detail/examples'
import {
  discoveredWordsHeading,
  noMatches,
  readingRefinementSpoken
} from '@zenbu/dictionary-core/results/results'
import { SearchIcon } from 'lucide-react'
import { Fragment } from 'react'
import { Disclosure } from '@/components/dictionary/disclosure'
import { ExampleList } from '@/components/dictionary/example-list'
import { KanjiDetails } from '@/components/dictionary/kanji-details'
import { Row, WordRow } from '@/components/dictionary/word-row'
import { Fill } from '@/components/fill'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ItemContent, ItemGroup, ItemSeparator } from '@/components/ui/item'
import type { SearchData, SearchExamplesData } from '@/lib/dictionary/data'
import { exampleListText } from '@/lib/dictionary/screen-text'
import type { Locale } from '@/lib/i18n/config'
import { coreText, sourceLang } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill, formatNumber, pluralOf } from '@/lib/i18n/format'

const searchExamplesAnchor = 'examples'

function NoResults({ locale }: { locale: Locale }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>{coreText(noMatches.title, locale)}</EmptyTitle>
        <EmptyDescription>{coreText(noMatches.message, locale)}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function KanjiRow({
  kanji,
  locale
}: {
  kanji: NonNullable<Extract<SearchData, { state: 'results' }>['kanji']>
  locale: Locale
}) {
  const shownSummary = coreText(kanji.summary, locale)
  const summary = (
    <>
      <span lang="ja" className="text-4xl font-light">
        {kanji.character}
      </span>
      <span className="flex flex-col gap-0.5" data-kanji-row={kanji.character}>
        <span className="text-xs font-bold">{coreText(kanji.label, locale)}</span>
        <span lang={shownSummary === kanji.summary ? sourceLang(locale) : undefined}>
          {shownSummary}
        </span>
      </span>
    </>
  )
  return kanji.details ? (
    <Disclosure
      label={fill(getDictionary(locale).search.kanjiRowLabel, {
        character: kanji.character,
        summary: shownSummary
      })}
      buttonClassName="rounded-none px-4 py-3"
      summary={summary}
    >
      <div className="px-4 pt-2 pb-4">
        <KanjiDetails kanji={kanji.details} locale={locale} />
      </div>
    </Disclosure>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3">{summary}</div>
  )
}

export function SearchExamplesSection({
  data,
  locale
}: {
  data: SearchExamplesData
  locale: Locale
}) {
  const t = getDictionary(locale)
  const count = exampleCountText(data)
  return (
    <Card id={searchExamplesAnchor} className="scroll-mt-4 px-4" data-section="searchExamples">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{t.examples.sentencesTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {count === null ? null : coreText(count, locale)}
        </p>
      </div>
      <ExampleList
        initial={data.examples}
        listed={data.listed}
        path={data.examplesPath}
        locale={locale}
        text={exampleListText(locale)}
      />
    </Card>
  )
}

export function SearchResults({
  data,
  examples = null,
  locale
}: {
  data: SearchData
  examples?: SearchExamplesData | null
  locale: Locale
}) {
  if (data.state === 'noResults') return <NoResults locale={locale} />
  const t = getDictionary(locale).search
  const { query, kanji, rows, readingRefinement } = data
  const discovered = data.sections.includes('discoveredWords')
  const listed = data.sections.includes('results') || discovered
  return (
    <>
      <p className="text-sm text-muted-foreground">
        <Fill
          template={pluralOf(t.wordsFor, rows.length, locale)}
          values={{
            count: formatNumber(rows.length, locale),
            query: (
              <span lang="ja" className="text-foreground">
                {query}
              </span>
            )
          }}
        />
      </p>
      {data.examples && (data.examples.target.kind === 'word' || examples) ? (
        <Card className="py-0" data-section="examples">
          <Row
            path={
              data.examples.target.kind === 'word'
                ? data.examples.target.path
                : `#${searchExamplesAnchor}`
            }
            locale={locale}
          >
            <ItemContent>
              <p className="font-semibold">{coreText(data.examples.title, locale)}</p>
            </ItemContent>
          </Row>
        </Card>
      ) : null}
      {readingRefinement ? (
        <Card className="py-0" data-section="readingRefinement">
          <Row
            path={readingRefinement.path}
            label={coreText(readingRefinementSpoken(readingRefinement.query), locale)}
            locale={locale}
          >
            <ItemContent>
              <p className="font-semibold">
                <Fill
                  template={t.readingRefinement}
                  values={{ query: <span lang="ja">{readingRefinement.query}</span> }}
                />
              </p>
            </ItemContent>
          </Row>
        </Card>
      ) : null}
      {listed ? (
        <Card className="py-2" data-section={discovered ? 'discoveredWords' : 'results'}>
          <ItemGroup className="gap-0">
            {discovered ? (
              <h2 className="px-4 py-2 font-semibold">
                {coreText(discoveredWordsHeading, locale)}
              </h2>
            ) : null}
            {kanji ? <KanjiRow kanji={kanji} locale={locale} /> : null}
            {rows.map((word, position) => (
              <Fragment key={word.id}>
                {position > 0 || kanji ? <ItemSeparator className="my-0" /> : null}
                <WordRow word={word} locale={locale} />
              </Fragment>
            ))}
          </ItemGroup>
        </Card>
      ) : null}
      {examples ? <SearchExamplesSection data={examples} locale={locale} /> : null}
    </>
  )
}
