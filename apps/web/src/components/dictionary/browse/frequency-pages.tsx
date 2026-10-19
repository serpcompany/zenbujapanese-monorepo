import {
  allRankBands,
  type JlptList,
  jlptLists,
  type RankedList,
  rankedList
} from '@zenbu/dictionary-core/browse/lists'
import { tierForRank } from '@zenbu/dictionary-core/detail/frequency'
import { cn } from 'cn'
import Link from 'next/link'
import {
  BrowseHeading,
  BrowsePage,
  LevelCard,
  Pagination,
  Panel,
  PanelHeading
} from '@/components/dictionary/browse/browse-ui'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { FrequencyDot } from '@/components/dictionary/frequency-dot'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { WordList } from '@/components/dictionary/word-row'
import {
  browseText,
  counted,
  inKanaOrder,
  jlptCopy,
  legendTiers,
  type RankedListCopy,
  rankedListCopy,
  rankRange,
  shortBandLabel,
  tierCutoffs,
  tierName
} from '@/lib/dictionary/browse/copy'
import type { BrowseWordsPage, RankBandWords } from '@/lib/dictionary/browse/data'
import {
  browsePath,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  rankBandPath,
  rankedListPath
} from '@/lib/dictionary/browse/paths'
import { rankPageRanks } from '@/lib/dictionary/browse/rank-pages'
import type { Linked } from '@/lib/dictionary/page-example'
import { pageSources } from '@/lib/dictionary/sources'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { joinedSentences } from '@/lib/snippets'

type Word = Linked<{ entSeq: number; headword: string; reading: string }>

interface RankedListsData {
  lists: { slug: string; mapped: number; listed: number; top: Word[] }[]
  jlpt: { slug: string; count: number; first: Word[] }[]
}

const frequencyCrumbs = (locale: Locale) => [
  { label: browseText(locale).names.browse, path: browsePath },
  { label: browseText(locale).names.frequency, path: frequencyDictionariesPath }
]

function WordChip({ word, locale }: { word: Word; locale: Locale }) {
  const className =
    'inline-flex min-h-9 items-center rounded-lg border px-2.5 text-base hover:bg-muted'
  return word.path ? (
    <Link href={localizedPath(word.path, locale)} lang="ja" className={className}>
      {word.headword}
    </Link>
  ) : (
    <span lang="ja" className={className}>
      {word.headword}
    </span>
  )
}

function TierLegend({ locale }: { locale: Locale }) {
  return (
    <ul
      aria-label={browseText(locale).frequency.tiers}
      className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted-foreground"
    >
      {legendTiers.map(tier => (
        <li key={tier} className="inline-flex items-center gap-1.5">
          <FrequencyDot tier={tier} />
          {tierName(tier, locale)}
        </li>
      ))}
    </ul>
  )
}

function RankBands({
  slug,
  name,
  current,
  locale
}: {
  slug: string
  name: string
  current?: number
  locale: Locale
}) {
  const box =
    'flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-1 text-xs tabular-nums'
  return (
    <nav aria-label={fill(browseText(locale).frequency.ranksOf, { name })}>
      <ul className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {allRankBands.map(band => (
          <li key={band.band}>
            {band.band === current ? (
              <span
                aria-current="page"
                className={cn(box, 'border-primary bg-primary text-primary-foreground')}
              >
                <FrequencyDot tier={tierForRank(band.first)} />
                {shortBandLabel(band, locale)}
              </span>
            ) : (
              <Link
                href={localizedPath(rankBandPath(slug, band.band), locale)}
                className={cn(box, 'hover:bg-muted')}
              >
                <FrequencyDot tier={tierForRank(band.first)} />
                {shortBandLabel(band, locale)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

function RankedPanel({ list, locale }: { list: RankedListsData['lists'][number]; locale: Locale }) {
  const definition = rankedList(list.slug)
  const copy = rankedListCopy(list.slug, locale)
  if (!definition || !copy || list.listed === 0) return null
  const [, source] = copy.sources
  const name = coreText(definition.name, locale)
  return (
    <Panel label={name}>
      <PanelHeading
        title={name}
        href={rankedListPath(list.slug)}
        aside={`${source.name} · ${source.license.name}`}
        locale={locale}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted-foreground">
          {browseText(locale).frequency.topWords}
        </span>
        {list.top.map(word => (
          <WordChip key={word.entSeq} word={word} locale={locale} />
        ))}
      </div>
      <RankBands slug={list.slug} name={name} locale={locale} />
    </Panel>
  )
}

function JlptPanel({ ranked, locale }: { ranked: RankedListsData; locale: Locale }) {
  const t = browseText(locale)
  const jlptWords = ranked.jlpt.reduce((sum, list) => sum + list.count, 0)
  return (
    <Panel label={t.names.jlptVocabulary}>
      <PanelHeading
        title={t.names.jlptVocabulary}
        aside={counted(t.frequency.jlptAside, jlptWords, locale)}
        locale={locale}
      />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {jlptLists.map(level => {
          const list = ranked.jlpt.find(each => each.slug === level.slug)
          return list ? (
            <LevelCard
              key={level.slug}
              href={jlptVocabularyPath(level.level)}
              title={`N${level.level}`}
              preview={list.first.map(word => word.headword).join(' ')}
              count={counted(t.counts.words, list.count, locale)}
              locale={locale}
            />
          ) : null
        })}
      </div>
    </Panel>
  )
}

export function FrequencyHubPage({ ranked, locale }: { ranked: RankedListsData; locale: Locale }) {
  const t = browseText(locale)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs locale={locale} pages={frequencyCrumbs(locale)} />
      <BrowseHeading title={t.frequency.title}>{t.frequency.intro}</BrowseHeading>
      <JlptPanel ranked={ranked} locale={locale} />
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-semibold">{t.frequency.rankedByUse}</h2>
          <TierLegend locale={locale} />
        </div>
        <p className="text-sm text-muted-foreground">
          {joinedSentences([tierCutoffs(locale), t.frequency.bandDot], locale)}
        </p>
        {ranked.lists.map(list => (
          <RankedPanel key={list.slug} list={list} locale={locale} />
        ))}
      </section>
      <SourceCredits sources={pageSources.frequency} locale={locale} />
    </BrowsePage>
  )
}

export function RankBandPage({
  list,
  band,
  page,
  copy,
  words,
  locale
}: {
  list: RankedList
  band: number
  page: number
  copy: RankedListCopy
  words: RankBandWords
  locale: Locale
}) {
  const t = browseText(locale)
  const name = coreText(list.name, locale)
  const range = rankRange(rankPageRanks(band, page), locale)
  const path = rankBandPath(list.slug, band, page)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        locale={locale}
        pages={[
          ...frequencyCrumbs(locale),
          { label: name, path: rankedListPath(list.slug) },
          ...(path === rankedListPath(list.slug) ? [] : [{ label: range, path }])
        ]}
      />
      <BrowseHeading title={fill(t.frequency.bandHeading, { name })}>
        {joinedSentences(
          [
            copy.description,
            counted(t.frequency.bandWords, words.words.length, locale, { range }),
            copy.unranked
          ],
          locale
        )}
      </BrowseHeading>
      <RankBands slug={list.slug} name={name} current={band} locale={locale} />
      <WordList words={words.words} section="words" locale={locale} />
      <Pagination
        page={page}
        pages={words.pages}
        pathFor={number => rankBandPath(list.slug, band, number)}
        locale={locale}
      />
      <SourceCredits sources={copy.sources} locale={locale} />
    </BrowsePage>
  )
}

export function JlptListPage({
  level,
  words,
  page,
  locale
}: {
  level: JlptList
  words: BrowseWordsPage
  page: number
  locale: Locale
}) {
  const t = browseText(locale)
  const copy = jlptCopy(locale)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        locale={locale}
        pages={[
          ...frequencyCrumbs(locale),
          { label: level.name, path: jlptVocabularyPath(level.level) }
        ]}
      />
      <BrowseHeading title={fill(t.frequency.jlptHeading, { name: level.name })}>
        {joinedSentences(
          [copy.description, inKanaOrder(words.total, page, words.pages, locale)],
          locale
        )}
      </BrowseHeading>
      <WordList words={words.words} section="words" locale={locale} />
      <Pagination
        page={page}
        pages={words.pages}
        pathFor={number => jlptVocabularyPath(level.level, number)}
        locale={locale}
      />
      <SourceCredits sources={copy.sources} locale={locale} />
    </BrowsePage>
  )
}
