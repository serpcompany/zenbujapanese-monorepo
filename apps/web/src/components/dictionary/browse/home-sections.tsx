import type { BrowseSummaryResponse } from '@zenbu/dictionary-core/artifact/browse'
import { commonWords } from '@zenbu/dictionary-core/browse/categories'
import {
  gradeLists,
  jinmeiyo,
  type KanjiList,
  secondarySchool
} from '@zenbu/dictionary-core/browse/lists'
import { Fill } from '@zenbu/ui/lib/fill'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Panel } from '@/components/dictionary/browse/browse-ui'
import { CategoryLinkLists } from '@/components/dictionary/browse/category-links'
import { KanaCharts } from '@/components/dictionary/browse/hub-pages'
import { KanjiTiles } from '@/components/dictionary/browse/kanji-tiles'
import { browseText, counted, kanjiListHeading, kanjiListName } from '@/lib/dictionary/browse/copy'
import {
  categoryPath,
  kanjiListPath,
  kanjiListsPath,
  scriptPath
} from '@/lib/dictionary/browse/paths'
import type { Linked } from '@/lib/dictionary/page-example'
import type { Locale } from '@/lib/i18n/config'
import { fill, formatNumber } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'

type Summary = Omit<BrowseSummaryResponse, 'commonWords'> & {
  commonWords: Linked<BrowseSummaryResponse['commonWords'][number]>[]
}

function Section({
  title,
  aside,
  children
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        {aside ? <div className="text-sm text-muted-foreground">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

const underlined = 'underline underline-offset-4 hover:text-foreground'

function KanjiByGrade({ summary, locale }: { summary: Summary; locale: Locale }) {
  const t = browseText(locale)
  const [firstGrade] = gradeLists
  const cards: { list: KanjiList; name: string }[] = [
    ...[...gradeLists, secondarySchool].map(list => ({ list, name: kanjiListName(list, locale) })),
    { list: jinmeiyo, name: fill(t.home.namesCard, { name: kanjiListName(jinmeiyo, locale) }) }
  ]
  const countOf = (slug: string) =>
    slug === jinmeiyo.slug
      ? summary.kanji.jinmeiyo
      : (summary.kanji.grades.find(grade => grade.slug === slug)?.count ?? 0)
  const kanji = (count: number) => counted(t.counts.kanji, count, locale)
  return (
    <Section
      title={t.home.byGrade}
      aside={
        <Link href={localizedPath(kanjiListsPath, locale)} className={underlined}>
          {fill(t.home.allJoyo, { count: formatNumber(summary.kanji.joyo, locale) })}
        </Link>
      }
    >
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map(({ list, name }) => (
          <li key={list.slug}>
            <Link
              href={localizedPath(kanjiListPath(list.slug), locale)}
              className="flex flex-col gap-0.5 rounded-lg border px-4 py-3.5 hover:bg-muted"
            >
              <span className="font-semibold">{name}</span>
              <span className="text-sm text-muted-foreground">{kanji(countOf(list.slug))}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Panel label={kanjiListHeading(firstGrade, locale)}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 className="font-semibold">
            {fill(t.home.firstGrade, {
              name: kanjiListName(firstGrade, locale),
              count: kanji(summary.firstGrade.length)
            })}
          </h3>
          <span className="text-sm text-muted-foreground">{t.home.opensSearch}</span>
        </div>
        <KanjiTiles
          characters={summary.firstGrade}
          label={kanjiListHeading(firstGrade, locale)}
          locale={locale}
        />
      </Panel>
    </Section>
  )
}

export function DictionaryHomeSections({
  summary,
  hiragana,
  locale
}: {
  summary: Summary
  hiragana: ReadonlySet<string>
  locale: Locale
}) {
  const t = browseText(locale)
  const scriptLink = (script: 'hiragana' | 'katakana') => (
    <Link href={localizedPath(scriptPath(script), locale)} className={underlined}>
      {t.names[script]}
    </Link>
  )
  return (
    <div className="flex w-full flex-col gap-14 border-t pt-12">
      <Section
        title={t.home.byKana}
        aside={
          <Fill
            template={t.home.byKanaAside}
            values={{ hiragana: scriptLink('hiragana'), katakana: scriptLink('katakana') }}
          />
        }
      >
        <KanaCharts script="hiragana" initials={hiragana} locale={locale} />
      </Section>
      <KanjiByGrade summary={summary} locale={locale} />
      <Section title={t.home.byCategory}>
        <CategoryLinkLists locale={locale} />
      </Section>
      <Section
        title={t.names.commonWords}
        aside={
          <Link href={localizedPath(categoryPath(commonWords.slug), locale)} className={underlined}>
            {counted(t.home.allCommon, summary.common, locale)}
          </Link>
        }
      >
        <ul lang="ja" className="flex flex-wrap gap-2">
          {summary.commonWords.map(word => (
            <li key={word.entSeq}>
              {word.path ? (
                <Link
                  href={localizedPath(word.path, locale)}
                  className="inline-flex min-h-11 items-center rounded-lg border px-3.5 text-base hover:bg-muted"
                >
                  {word.headword}
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center rounded-lg border px-3.5 text-base">
                  {word.headword}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
