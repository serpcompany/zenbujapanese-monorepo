import type { BrowseSummaryResponse } from '@zenbu/dictionary-core/artifact/browse'
import { commonWords } from '@zenbu/dictionary-core/browse/categories'
import { gradeLists, jinmeiyo, secondarySchool } from '@zenbu/dictionary-core/browse/lists'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Panel } from '@/components/dictionary/browse/browse-ui'
import { CategoryLinkLists } from '@/components/dictionary/browse/category-links'
import { KanaCharts } from '@/components/dictionary/browse/hub-pages'
import { KanjiTiles } from '@/components/dictionary/browse/kanji-tiles'
import { formatCount, plural } from '@/lib/dictionary/browse/copy'
import {
  categoryPath,
  kanjiListPath,
  kanjiListsPath,
  scriptPath
} from '@/lib/dictionary/browse/paths'
import type { Linked } from '@/lib/dictionary/page-example'

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

export function DictionaryHomeSections({ summary }: { summary: Summary }) {
  const kanjiCards = [
    ...gradeLists.map(list => ({ list, name: list.name })),
    { list: secondarySchool, name: secondarySchool.name },
    { list: jinmeiyo, name: `${jinmeiyo.name} (names)` }
  ]
  const countOf = (slug: string) =>
    slug === jinmeiyo.slug
      ? summary.kanji.jinmeiyo
      : (summary.kanji.grades.find(grade => grade.slug === slug)?.count ?? 0)
  return (
    <div className="flex w-full flex-col gap-14 border-t pt-12">
      <Section
        title="Browse by kana"
        aside={
          <>
            Every word, by the kana it starts with ·{' '}
            <Link href={scriptPath('hiragana')} className={underlined}>
              Hiragana
            </Link>{' '}
            ·{' '}
            <Link href={scriptPath('katakana')} className={underlined}>
              Katakana
            </Link>
          </>
        }
      >
        <KanaCharts script="hiragana" />
      </Section>
      <Section
        title="Kanji by school grade"
        aside={
          <Link href={kanjiListsPath} className={underlined}>
            All {formatCount(summary.kanji.joyo)} jōyō kanji
          </Link>
        }
      >
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kanjiCards.map(({ list, name }) => (
            <li key={list.slug}>
              <Link
                href={kanjiListPath(list.slug)}
                className="flex flex-col gap-0.5 rounded-lg border px-4 py-3.5 hover:bg-muted"
              >
                <span className="font-semibold">{name}</span>
                <span className="text-sm text-muted-foreground">
                  {plural(countOf(list.slug), 'kanji', 'kanji')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Panel label="Grade 1 kanji">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h3 className="font-semibold">
              Grade 1 · {plural(summary.firstGrade.length, 'kanji', 'kanji')}
            </h3>
            <span className="text-sm text-muted-foreground">
              Each opens that kanji’s search page
            </span>
          </div>
          <KanjiTiles characters={summary.firstGrade} label="Grade 1 kanji" />
        </Panel>
      </Section>
      <Section title="Browse by category">
        <CategoryLinkLists />
      </Section>
      <Section
        title="Common words"
        aside={
          <Link href={categoryPath(commonWords.slug)} className={underlined}>
            All {plural(summary.common, 'common word')}
          </Link>
        }
      >
        <ul lang="ja" className="flex flex-wrap gap-2">
          {summary.commonWords.map(word => (
            <li key={word.entSeq}>
              {word.path ? (
                <Link
                  href={word.path}
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
