import {
  browsePageSize,
  jlptLists,
  rankedListLimit,
  rankedLists
} from '@zenbu/dictionary-core/browse/lists'
import {
  type FrequencyTier,
  tierForRank,
  tierLabels
} from '@zenbu/dictionary-core/detail/frequency'
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
import { FrequencyDot } from '@/components/dictionary/frequency'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { WordList } from '@/components/dictionary/word-row'
import { formatCount, plural, rankedListCopy } from '@/lib/dictionary/browse/copy'
import type { BrowseWordsPage } from '@/lib/dictionary/browse/data'
import {
  browsePath,
  frequencyDictionariesPath,
  rankBandPath,
  rankedListPath
} from '@/lib/dictionary/browse/paths'
import type { Linked } from '@/lib/dictionary/page-example'
import { pageSources, type Source } from '@/lib/dictionary/sources'

type Word = Linked<{ entSeq: number; headword: string; reading: string }>

interface RankedListsData {
  lists: { slug: string; mapped: number; listed: number; top: Word[] }[]
  jlpt: { slug: string; count: number; first: Word[] }[]
}

const bandSize = 1_000
const bands = Array.from({ length: rankedListLimit / bandSize }, (_, index) => index * bandSize + 1)
const bandLabel = (first: number) =>
  `${first === 1 ? '1' : `${(first - 1) / bandSize}k`}–${(first - 1) / bandSize + 1}k`
const bandTiers = [...new Set(bands.map(tierForRank))]

const browseCrumb = { label: 'Browse', path: browsePath }
const frequencyCrumb = { label: 'Frequency dictionaries', path: frequencyDictionariesPath }

function WordChip({ word }: { word: Word }) {
  const className =
    'inline-flex min-h-9 items-center rounded-lg border px-2.5 text-base hover:bg-muted'
  return word.path ? (
    <Link href={word.path} lang="ja" className={className}>
      {word.headword}
    </Link>
  ) : (
    <span lang="ja" className={className}>
      {word.headword}
    </span>
  )
}

function TierLegend({ tiers }: { tiers: readonly FrequencyTier[] }) {
  return (
    <ul
      aria-label="Tiers"
      className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted-foreground"
    >
      {tiers.map(tier => (
        <li key={tier} className="inline-flex items-center gap-1.5">
          <FrequencyDot tier={tier} />
          {tierLabels[tier].replace(/^./u, letter => letter.toUpperCase())}
        </li>
      ))}
    </ul>
  )
}

function RankedPanel({ list }: { list: RankedListsData['lists'][number] }) {
  const definition = rankedLists.find(each => each.slug === list.slug)
  const copy = rankedListCopy[list.slug]
  if (!definition || !copy || list.listed === 0) return null
  const [, source] = copy.sources
  return (
    <Panel label={definition.name}>
      <PanelHeading
        title={definition.name}
        href={rankedListPath(list.slug)}
        aside={`${source.name} · ${source.license.name}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted-foreground">Top words</span>
        {list.top.map(word => (
          <WordChip key={word.entSeq} word={word} />
        ))}
      </div>
      <ul
        aria-label={`${definition.name} ranks`}
        className="grid grid-cols-5 gap-1.5 sm:grid-cols-10"
      >
        {bands.map(first => (
          <li key={first}>
            <Link
              href={rankBandPath(list.slug, first)}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-1 text-xs tabular-nums hover:bg-muted"
            >
              <FrequencyDot tier={tierForRank(first)} />
              {bandLabel(first)}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function FrequencyHubPage({ ranked }: { ranked: RankedListsData }) {
  const jlptWords = ranked.jlpt.reduce((sum, list) => sum + list.count, 0)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs pages={[browseCrumb, frequencyCrumb]} />
      <BrowseHeading title="Japanese frequency dictionaries">
        Which words to learn first: the JLPT vocabulary lists by level, and eight lists that rank
        words by how often they’re used on YouTube, on Wikipedia, and in TV, anime, manga, novels,
        visual novels, and video games. They’re the same dictionaries the app offers.
      </BrowseHeading>
      <Panel label="JLPT vocabulary">
        <PanelHeading
          title="JLPT vocabulary"
          aside={`Jonathan Waller’s JLPT lists · ${plural(jlptWords, 'word')}`}
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {jlptLists.map(level => {
            const list = ranked.jlpt.find(each => each.slug === level.slug)
            return list ? (
              <LevelCard
                key={level.slug}
                href={rankedListPath(level.slug)}
                title={`N${level.level}`}
                preview={list.first.map(word => word.headword).join(' ')}
                count={plural(list.count, 'word')}
              />
            ) : null
          })}
        </div>
      </Panel>
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-semibold">Ranked by use</h2>
          <TierLegend tiers={bandTiers} />
        </div>
        <p className="text-sm text-muted-foreground">
          Each band’s dot is the tier the app’s chips give its first rank.
        </p>
        {ranked.lists.map(list => (
          <RankedPanel key={list.slug} list={list} />
        ))}
      </section>
      <SourceCredits sources={pageSources.frequency} />
    </BrowsePage>
  )
}

export function RankedListPage({
  slug,
  name,
  description,
  sources,
  words,
  page,
  ranked
}: {
  slug: string
  name: string
  description: string
  sources: Source[]
  words: BrowseWordsPage
  page: number
  ranked: boolean
}) {
  const range = ranked
    ? `Ranks ${formatCount((page - 1) * browsePageSize + 1)} to ${formatCount(page * browsePageSize)}.`
    : `${plural(words.total, 'word')}, in kana order${words.pages > 1 ? `, page ${page} of ${words.pages}` : ''}.`
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[browseCrumb, frequencyCrumb, { label: name, path: rankedListPath(slug) }]}
      />
      <BrowseHeading title={ranked ? `Most used Japanese words: ${name}` : `${name} vocabulary`}>
        {description} {range}
      </BrowseHeading>
      <WordList words={words.words} section="words" />
      <Pagination
        page={page}
        pages={words.pages}
        pathFor={number => rankedListPath(slug, number)}
      />
      <SourceCredits sources={sources} />
    </BrowsePage>
  )
}
