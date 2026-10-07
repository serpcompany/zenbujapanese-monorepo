import {
  allRankBands,
  type JlptList,
  jlptLists,
  type RankBand,
  type RankedList,
  rankBandSize,
  rankedLists
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
import { FrequencyDot } from '@/components/dictionary/frequency'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { WordList } from '@/components/dictionary/word-row'
import {
  jlptCopy,
  legendTiers,
  plural,
  type RankedListCopy,
  rankedListCopy,
  rankRange,
  tierCutoffs,
  tierNames
} from '@/lib/dictionary/browse/copy'
import type { BrowseWordsPage } from '@/lib/dictionary/browse/data'
import {
  browsePath,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  rankBandPath,
  rankedListPath
} from '@/lib/dictionary/browse/paths'
import type { Linked } from '@/lib/dictionary/page-example'
import { pageSources } from '@/lib/dictionary/sources'

type Word = Linked<{ entSeq: number; headword: string; reading: string }>

interface RankedListsData {
  lists: { slug: string; mapped: number; listed: number; top: Word[] }[]
  jlpt: { slug: string; count: number; first: Word[] }[]
}

const thousands = (rank: number) => `${rank / rankBandSize}k`

const shortBandLabel = (band: RankBand) =>
  `${band.first === 1 ? '1' : thousands(band.first - 1)}–${thousands(band.last)}`

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

function TierLegend() {
  return (
    <ul
      aria-label="Tiers"
      className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted-foreground"
    >
      {legendTiers.map(tier => (
        <li key={tier} className="inline-flex items-center gap-1.5">
          <FrequencyDot tier={tier} />
          {tierNames[tier]}
        </li>
      ))}
    </ul>
  )
}

function RankBands({ slug, name, current }: { slug: string; name: string; current?: number }) {
  const box =
    'flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-1 text-xs tabular-nums'
  return (
    <nav aria-label={`${name} ranks`}>
      <ul className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {allRankBands.map(band => (
          <li key={band.band}>
            {band.band === current ? (
              <span
                aria-current="page"
                className={cn(box, 'border-primary bg-primary text-primary-foreground')}
              >
                <FrequencyDot tier={tierForRank(band.first)} />
                {shortBandLabel(band)}
              </span>
            ) : (
              <Link href={rankBandPath(slug, band.band)} className={cn(box, 'hover:bg-muted')}>
                <FrequencyDot tier={tierForRank(band.first)} />
                {shortBandLabel(band)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
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
      <RankBands slug={list.slug} name={definition.name} />
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
                href={jlptVocabularyPath(level.level)}
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
          <TierLegend />
        </div>
        <p className="text-sm text-muted-foreground">
          {tierCutoffs} Each band’s dot is the tier of its first rank.
        </p>
        {ranked.lists.map(list => (
          <RankedPanel key={list.slug} list={list} />
        ))}
      </section>
      <SourceCredits sources={pageSources.frequency} />
    </BrowsePage>
  )
}

export function RankBandPage({
  list,
  band,
  copy,
  words
}: {
  list: RankedList
  band: number
  copy: RankedListCopy
  words: BrowseWordsPage
}) {
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[
          browseCrumb,
          frequencyCrumb,
          { label: list.name, path: rankedListPath(list.slug) },
          ...(band > 1 ? [{ label: rankRange(band), path: rankBandPath(list.slug, band) }] : [])
        ]}
      />
      <BrowseHeading title={`Most used Japanese words: ${list.name}`}>
        {copy.description} Ranks {rankRange(band)}: {plural(words.words.length, 'word')}.
        {copy.unranked ? ` ${copy.unranked}` : ''}
      </BrowseHeading>
      <RankBands slug={list.slug} name={list.name} current={band} />
      <WordList words={words.words} section="words" />
      <SourceCredits sources={copy.sources} />
    </BrowsePage>
  )
}

export function JlptListPage({
  level,
  words,
  page
}: {
  level: JlptList
  words: BrowseWordsPage
  page: number
}) {
  const paged = words.pages > 1 ? `, page ${page} of ${words.pages}` : ''
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[
          browseCrumb,
          frequencyCrumb,
          { label: level.name, path: jlptVocabularyPath(level.level) }
        ]}
      />
      <BrowseHeading title={`${level.name} vocabulary`}>
        {jlptCopy.description} {plural(words.total, 'word')}, in kana order{paged}.
      </BrowseHeading>
      <WordList words={words.words} section="words" />
      <Pagination
        page={page}
        pages={words.pages}
        pathFor={number => jlptVocabularyPath(level.level, number)}
      />
      <SourceCredits sources={jlptCopy.sources} />
    </BrowsePage>
  )
}
