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
import { SourceCredits } from '@zenbu/ui/dictionary/source-credits'
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
import { browseText, counted, kanjiListHeading, kanjiListName } from '@/lib/dictionary/browse/copy'
import {
  browsePath,
  kanjiListPath,
  kanjiListsPath,
  strokeCountsAnchor
} from '@/lib/dictionary/browse/paths'
import { sourceCreditsIn } from '@/lib/dictionary/screen-text'
import { pageSources } from '@/lib/dictionary/sources'
import type { Locale } from '@/lib/i18n/config'
import { fill, formatNumber } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'

const kanjiCrumbs = (locale: Locale) => [
  { label: browseText(locale).names.browse, path: browsePath },
  { label: browseText(locale).names.kanji, path: kanjiListsPath }
]

const charactersOf = (hub: KanjiHubResponse, list: KanjiList) =>
  hub.lists.find(found => found.slug === list.slug)?.characters ?? []

const kanjiCount = (count: number, locale: Locale) =>
  counted(browseText(locale).counts.kanji, count, locale)

function CountAside({ count, locale }: { count: number; locale: Locale }) {
  return (
    <span className="text-sm font-normal text-muted-foreground">
      {fill(browseText(locale).kanji.countAside, { count: kanjiCount(count, locale) })}
    </span>
  )
}

function GradeJump({ hub, locale }: { hub: KanjiHubResponse; locale: Locale }) {
  const t = browseText(locale).kanji
  const jumpClass =
    'inline-flex min-h-8 items-center text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground'
  const jinmeiyoPath = localizedPath(kanjiListPath(jinmeiyo.slug), locale)
  return (
    <>
      <nav aria-label={t.grades} className="flex flex-wrap gap-x-5 gap-y-1 max-sm:hidden">
        {[...gradeLists, secondarySchool].map(list => (
          <a key={list.slug} href={`#${list.slug}`} className={jumpClass}>
            {kanjiListName(list, locale)}
          </a>
        ))}
        <Link href={jinmeiyoPath} className={jumpClass}>
          {kanjiListName(jinmeiyo, locale)}
        </Link>
      </nav>
      <details className="relative sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg border px-3.5 font-medium [&::-webkit-details-marker]:hidden">
          {t.jumpToGrade}
          <span aria-hidden="true" className="text-muted-foreground">
            ▾
          </span>
        </summary>
        <ul className="mt-1.5 flex flex-col rounded-xl border bg-background p-1.5 shadow-lg">
          {schoolLists.map(list => (
            <li key={list.slug}>
              <a
                href={list === jinmeiyo ? jinmeiyoPath : `#${list.slug}`}
                className="flex min-h-11 items-center justify-between rounded-md px-2.5 hover:bg-muted"
              >
                {kanjiListName(list, locale)}
                <span className="text-sm text-muted-foreground">
                  {formatNumber(charactersOf(hub, list).length, locale)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}

function JlptLevels({ hub, locale }: { hub: KanjiHubResponse; locale: Locale }) {
  const t = browseText(locale).kanji
  const levels = jlptKanjiLists.flatMap(list => {
    const level = hub.jlpt.find(each => each.slug === list.slug)
    return level && level.count > 0 ? [{ list, level }] : []
  })
  if (levels.length === 0) return null
  return (
    <section aria-label={t.byJlpt} className="flex flex-col gap-3.5">
      <PanelHeading title={t.byJlpt} aside={t.wallersLists} locale={locale} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {levels.map(({ list, level }) => (
          <LevelCard
            key={list.slug}
            href={kanjiListPath(list.slug)}
            title={kanjiListName(list, locale)}
            preview={level.first.join(' ')}
            count={kanjiCount(level.count, locale)}
            locale={locale}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t.jlptEstimate}</p>
    </section>
  )
}

function GradeSections({ hub, locale }: { hub: KanjiHubResponse; locale: Locale }) {
  const t = browseText(locale).kanji
  const secondary = charactersOf(hub, secondarySchool)
  const names = charactersOf(hub, jinmeiyo).length
  return (
    <section className="flex flex-col gap-5">
      <PanelHeading title={t.bySchoolGrade} aside={t.mostFrequentFirst} locale={locale} />
      <GradeJump hub={hub} locale={locale} />
      {gradeLists.map(list => {
        const characters = charactersOf(hub, list)
        return (
          <div key={list.slug} id={list.slug} className="flex scroll-mt-4 flex-col gap-2.5">
            <h3 className="text-lg font-semibold">
              <Link
                href={localizedPath(kanjiListPath(list.slug), locale)}
                className="underline decoration-border underline-offset-4"
              >
                {kanjiListName(list, locale)}
              </Link>{' '}
              <CountAside count={characters.length} locale={locale} />
            </h3>
            <KanjiTiles
              characters={characters}
              label={kanjiListHeading(list, locale)}
              locale={locale}
            />
          </div>
        )
      })}
      <details id={secondarySchool.slug} className="scroll-mt-4 rounded-xl border px-4 py-3">
        <summary className="min-h-8 cursor-pointer text-lg font-semibold">
          {kanjiListName(secondarySchool, locale)}{' '}
          <CountAside count={secondary.length} locale={locale} />
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <KanjiTiles
            characters={secondary}
            label={kanjiListHeading(secondarySchool, locale)}
            locale={locale}
          />
          <Link
            href={localizedPath(kanjiListPath(secondarySchool.slug), locale)}
            className="text-sm underline underline-offset-4"
          >
            {t.secondaryWithMeanings}
          </Link>
        </div>
      </details>
      <Link
        href={localizedPath(kanjiListPath(jinmeiyo.slug), locale)}
        className="flex items-center justify-between gap-3 rounded-xl border px-4 py-4 hover:bg-muted"
      >
        <span className="font-semibold">
          {counted(t.jinmeiyoLink, names, locale, { name: kanjiListName(jinmeiyo, locale) })}
        </span>
        <span className="text-sm text-muted-foreground">{t.openList}</span>
      </Link>
    </section>
  )
}

export function KanjiHubPage({
  hub,
  joyo,
  locale
}: {
  hub: KanjiHubResponse
  joyo: number
  locale: Locale
}) {
  const t = browseText(locale)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs locale={locale} pages={kanjiCrumbs(locale)} />
      <BrowseHeading title={t.names.kanjiLists}>
        {fill(t.kanji.hubIntro, {
          joyo: formatNumber(joyo, locale),
          jinmeiyo: formatNumber(charactersOf(hub, jinmeiyo).length, locale)
        })}
      </BrowseHeading>
      <GradeSections hub={hub} locale={locale} />
      <JlptLevels hub={hub} locale={locale} />
      <section id={strokeCountsAnchor} className="flex scroll-mt-4 flex-col gap-3.5">
        <PanelHeading title={t.names.byStrokeCount} locale={locale} />
        <ul
          aria-label={t.kanji.strokeCounts}
          className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5"
        >
          {hub.strokes.map(({ strokes, count }) => (
            <li key={strokes}>
              <Link
                href={localizedPath(kanjiListPath(strokeList(strokes).slug), locale)}
                aria-label={fill(t.kanji.strokeTile, {
                  strokes: formatNumber(strokes, locale),
                  count: kanjiCount(count, locale)
                })}
                className="flex min-h-14 flex-col items-center justify-center rounded-lg border hover:bg-muted"
              >
                <span className="font-semibold">{formatNumber(strokes, locale)}</span>
                <span className="text-xs text-muted-foreground">{formatNumber(count, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{t.kanji.strokesNote}</p>
      </section>
      <SourceCredits {...sourceCreditsIn(pageSources.kanjiLevels, locale)} />
    </BrowsePage>
  )
}

export function KanjiListPage({
  list,
  kanji,
  intro,
  locale
}: {
  list: KanjiList
  kanji: KanjiListResponse
  intro: string
  locale: Locale
}) {
  const t = browseText(locale)
  const heading = kanjiListHeading(list, locale)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        locale={locale}
        pages={[
          ...kanjiCrumbs(locale),
          { label: kanjiListName(list, locale), path: kanjiListPath(list.slug) }
        ]}
      />
      <BrowseHeading title={heading}>{intro}</BrowseHeading>
      <LinkTabs
        label={t.names.kanjiLists}
        locale={locale}
        tabs={(list.jlptLevel === undefined ? schoolLists : jlptKanjiLists).map(each => ({
          label: kanjiListName(each, locale),
          href: kanjiListPath(each.slug),
          current: each.slug === list.slug
        }))}
      />
      <KanjiMeaningTiles kanji={kanji.kanji} label={heading} locale={locale} />
      <SourceCredits
        {...sourceCreditsIn(
          list.jlptLevel === undefined ? pageSources.kanji : pageSources.kanjiLevels,
          locale
        )}
      />
    </BrowsePage>
  )
}
