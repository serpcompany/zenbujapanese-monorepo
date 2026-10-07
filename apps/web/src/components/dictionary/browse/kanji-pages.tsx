import type { KanjiHubResponse, KanjiListResponse } from '@zenbu/dictionary-core/artifact/browse'
import {
  gradeLists,
  jinmeiyo,
  jlptKanjiLists,
  type KanjiList,
  schoolLists,
  secondarySchool,
  strokeList
} from '@zenbu/dictionary-core/browse/lists'
import Link from 'next/link'
import {
  BrowseHeading,
  BrowsePage,
  LevelCard,
  LinkTabs,
  PanelHeading
} from '@/components/dictionary/browse/browse-ui'
import { KanjiMeaningTiles, KanjiTiles } from '@/components/dictionary/browse/kanji-tiles'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { formatCount, jlptKanjiEstimate, plural } from '@/lib/dictionary/browse/copy'
import {
  browsePath,
  kanjiListPath,
  kanjiListsPath,
  strokeCountsAnchor
} from '@/lib/dictionary/browse/paths'
import { pageSources } from '@/lib/dictionary/sources'

const browseCrumb = { label: 'Browse', path: browsePath }
const kanjiCrumb = { label: 'Kanji', path: kanjiListsPath }

const charactersOf = (hub: KanjiHubResponse, list: KanjiList) =>
  hub.lists.find(found => found.slug === list.slug)?.characters ?? []

function GradeJump({ hub }: { hub: KanjiHubResponse }) {
  const jumpClass =
    'inline-flex min-h-8 items-center text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground'
  return (
    <>
      <nav aria-label="Grades" className="flex flex-wrap gap-x-5 gap-y-1 max-sm:hidden">
        {gradeLists.map(list => (
          <a key={list.slug} href={`#${list.slug}`} className={jumpClass}>
            {list.name}
          </a>
        ))}
        <a href={`#${secondarySchool.slug}`} className={jumpClass}>
          {secondarySchool.name}
        </a>
        <Link href={kanjiListPath(jinmeiyo.slug)} className={jumpClass}>
          {jinmeiyo.name}
        </Link>
      </nav>
      <details className="relative sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg border px-3.5 font-medium [&::-webkit-details-marker]:hidden">
          Jump to a grade
          <span aria-hidden="true" className="text-muted-foreground">
            ▾
          </span>
        </summary>
        <ul className="mt-1.5 flex flex-col rounded-xl border bg-background p-1.5 shadow-lg">
          {schoolLists.map(list => (
            <li key={list.slug}>
              <a
                href={list === jinmeiyo ? kanjiListPath(list.slug) : `#${list.slug}`}
                className="flex min-h-11 items-center justify-between rounded-md px-2.5 hover:bg-muted"
              >
                {list.name}
                <span className="text-sm text-muted-foreground">
                  {formatCount(charactersOf(hub, list).length)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}

function JlptLevels({ hub }: { hub: KanjiHubResponse }) {
  const levels = jlptKanjiLists.flatMap(list => {
    const level = hub.jlpt.find(each => each.slug === list.slug)
    return level && level.count > 0 ? [{ list, level }] : []
  })
  if (levels.length === 0) return null
  return (
    <section aria-label="By JLPT level" className="flex flex-col gap-3.5">
      <PanelHeading title="By JLPT level" aside="Jonathan Waller’s lists" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {levels.map(({ list, level }) => (
          <LevelCard
            key={list.slug}
            href={kanjiListPath(list.slug)}
            title={list.name}
            preview={level.first.join('')}
            count={plural(level.count, 'kanji', 'kanji')}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{jlptKanjiEstimate}</p>
    </section>
  )
}

export function KanjiHubPage({ hub, joyo }: { hub: KanjiHubResponse; joyo: number }) {
  const secondary = charactersOf(hub, secondarySchool)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs pages={[browseCrumb, kanjiCrumb]} />
      <BrowseHeading title="Kanji lists">
        The {formatCount(joyo)} jōyō kanji, and the{' '}
        {formatCount(charactersOf(hub, jinmeiyo).length)} more used in names, by school grade, JLPT
        level, and stroke count. Each kanji opens its search page, with its readings, stroke order,
        and every word that uses it.
      </BrowseHeading>
      <section className="flex flex-col gap-5">
        <PanelHeading title="By school grade" aside="Most frequent first" />
        <GradeJump hub={hub} />
        {gradeLists.map(list => {
          const characters = charactersOf(hub, list)
          return (
            <div key={list.slug} id={list.slug} className="flex scroll-mt-4 flex-col gap-2.5">
              <h3 className="text-lg font-semibold">
                <Link
                  href={kanjiListPath(list.slug)}
                  className="underline decoration-border underline-offset-4"
                >
                  {list.name}
                </Link>{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  · {plural(characters.length, 'kanji', 'kanji')}
                </span>
              </h3>
              <KanjiTiles characters={characters} label={`${list.name} kanji`} />
            </div>
          )
        })}
        <details id={secondarySchool.slug} className="scroll-mt-4 rounded-xl border px-4 py-3">
          <summary className="min-h-8 cursor-pointer text-lg font-semibold">
            {secondarySchool.name}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              · {plural(secondary.length, 'kanji', 'kanji')}
            </span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <KanjiTiles characters={secondary} label={`${secondarySchool.name} kanji`} />
            <Link
              href={kanjiListPath(secondarySchool.slug)}
              className="text-sm underline underline-offset-4"
            >
              Secondary school kanji with their meanings
            </Link>
          </div>
        </details>
        <Link
          href={kanjiListPath(jinmeiyo.slug)}
          className="flex items-center justify-between gap-3 rounded-xl border px-4 py-4 hover:bg-muted"
        >
          <span className="font-semibold">
            {jinmeiyo.name}:{' '}
            {plural(charactersOf(hub, jinmeiyo).length, 'more kanji', 'more kanji')} used in names
          </span>
          <span className="text-sm text-muted-foreground">Open the list →</span>
        </Link>
      </section>
      <JlptLevels hub={hub} />
      <section id={strokeCountsAnchor} className="flex scroll-mt-4 flex-col gap-3.5">
        <PanelHeading title="By stroke count" />
        <ul
          aria-label="Stroke counts"
          className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5"
        >
          {hub.strokes.map(({ strokes, count }) => (
            <li key={strokes}>
              <Link
                href={kanjiListPath(strokeList(strokes).slug)}
                aria-label={`${strokes} strokes, ${plural(count, 'kanji', 'kanji')}`}
                className="flex min-h-14 flex-col items-center justify-center rounded-lg border hover:bg-muted"
              >
                <span className="font-semibold">{strokes}</span>
                <span className="text-[11px] text-muted-foreground">{formatCount(count)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Strokes, then how many jōyō kanji have that many.
        </p>
      </section>
      <SourceCredits sources={pageSources.kanjiLevels} />
    </BrowsePage>
  )
}

export function KanjiListPage({
  list,
  kanji,
  intro
}: {
  list: KanjiList
  kanji: KanjiListResponse
  intro: string
}) {
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[browseCrumb, kanjiCrumb, { label: list.name, path: kanjiListPath(list.slug) }]}
      />
      <BrowseHeading title={`${list.name} kanji`}>{intro}</BrowseHeading>
      <LinkTabs
        label="Kanji lists"
        tabs={(list.jlptLevel === undefined ? schoolLists : jlptKanjiLists).map(each => ({
          label: each.name,
          href: kanjiListPath(each.slug),
          current: each.slug === list.slug
        }))}
      />
      <KanjiMeaningTiles kanji={kanji.kanji} label={`${list.name} kanji`} />
      <SourceCredits
        sources={list.jlptLevel === undefined ? pageSources.kanji : pageSources.kanjiLevels}
      />
    </BrowsePage>
  )
}
