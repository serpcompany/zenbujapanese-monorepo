import type { KanaCount, KanaIndexResponse } from '@zenbu/dictionary-core/artifact/browse'
import {
  chartKana,
  dakuonRows,
  gojuonRows,
  inScript,
  type KanaScript
} from '@zenbu/dictionary-core/browse/kana'
import { pageCount } from '@zenbu/dictionary-core/browse/lists'
import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { SourceCredits } from '@zenbu/ui/dictionary/source-credits'
import { Fill } from '@zenbu/ui/lib/fill'
import Link from 'next/link'
import {
  BrowseHeading,
  BrowsePage,
  Chip,
  Chips,
  LinkTabs,
  Pagination,
  Sentences
} from '@/components/dictionary/browse/browse-ui'
import { KanaChart } from '@/components/dictionary/browse/kana-chart'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { WordList } from '@/components/dictionary/word-row'
import { browseText, counted, inKanaOrder } from '@/lib/dictionary/browse/copy'
import type { BrowseWordsPage, KanaInitialPage } from '@/lib/dictionary/browse/data'
import { browsePath, kanaChartsPath, kanaPath, scriptPath } from '@/lib/dictionary/browse/paths'
import { sourceCreditsIn } from '@/lib/dictionary/screen-text'
import { pageSources } from '@/lib/dictionary/sources'
import type { Locale } from '@/lib/i18n/config'
import { fill, formatNumber } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'

const browseCrumb = (locale: Locale) => ({
  label: browseText(locale).names.browse,
  path: browsePath
})
const scriptCrumb = (script: KanaScript, locale: Locale) => ({
  label: browseText(locale).names[script],
  path: scriptPath(script)
})
const kanaCrumb = (script: KanaScript, kana: string) => ({
  label: kana,
  path: kanaPath(script, kana),
  lang: 'ja' as const
})

function ScriptTabs({ script, locale }: { script: KanaScript; locale: Locale }) {
  const t = browseText(locale)
  return (
    <LinkTabs
      label={t.kana.scriptTabs}
      locale={locale}
      tabs={(['hiragana', 'katakana'] as const).map(each => ({
        label: t.names[each],
        href: scriptPath(each),
        current: each === script
      }))}
      trailing={
        <Link
          href={localizedPath(kanaChartsPath, locale)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t.kana.chartsWithRomaji}
        </Link>
      }
    />
  )
}

function CountChart({
  script,
  counts,
  rows,
  label,
  locale
}: {
  script: KanaScript
  counts: ReadonlyMap<string, number>
  rows: typeof gojuonRows
  label: string
  locale: Locale
}) {
  const t = browseText(locale)
  return (
    <KanaChart
      rows={inScript(rows, script)}
      label={label}
      large
      locale={locale}
      tile={cell => {
        const count = counts.get(cell.kana)
        return count
          ? {
              href: kanaPath(script, cell.kana),
              note: formatNumber(count, locale),
              label: counted(t.kana.tile, count, locale, { kana: cell.kana })
            }
          : null
      }}
    />
  )
}

function ChartHeading({ name, native }: { name: string; native: string }) {
  return (
    <h2 className="text-xl font-semibold">
      {name}
      {name === native ? null : (
        <>
          {' '}
          <span lang="ja" className="font-normal whitespace-nowrap text-muted-foreground">
            {native}
          </span>
        </>
      )}
    </h2>
  )
}

export function ScriptIndex({
  index,
  heading,
  locale
}: {
  index: KanaIndexResponse
  heading: string
  locale: Locale
}) {
  const t = browseText(locale)
  const { script, initials } = index
  const counts = new Map(initials.map(({ kana, count }) => [kana, count]))
  const charted = chartKana(script)
  const others = initials.filter(({ kana }) => !charted.has(kana))
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        locale={locale}
        pages={[
          browseCrumb(locale),
          { label: t.names.kana, path: kanaChartsPath },
          scriptCrumb(script, locale)
        ]}
      />
      <BrowseHeading title={heading}>
        {counted(t.kana.scripts[script].intro, index.total, locale)}
      </BrowseHeading>
      <ScriptTabs script={script} locale={locale} />
      <section className="flex flex-col gap-3">
        <ChartHeading name={t.kana.gojuon} native="五十音" />
        <CountChart
          script={script}
          counts={counts}
          rows={gojuonRows}
          label={t.kana.gojuon}
          locale={locale}
        />
      </section>
      <section className="flex flex-col gap-3">
        <ChartHeading name={t.kana.dakuon} native="濁音・半濁音" />
        <div className="sm:max-w-[50%]">
          <CountChart
            script={script}
            counts={counts}
            rows={dakuonRows}
            label={t.kana.dakuon}
            locale={locale}
          />
        </div>
      </section>
      {others.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t.kana.other}</h2>
          <Chips label={t.kana.otherKana}>
            {others.map(({ kana, count }) => (
              <Chip key={kana} href={kanaPath(script, kana)} locale={locale}>
                <span lang="ja">{kana}</span>
                <span className="text-xs text-muted-foreground">{formatNumber(count, locale)}</span>
              </Chip>
            ))}
          </Chips>
        </section>
      ) : null}
      <SourceCredits {...sourceCreditsIn([sourceCredits.jmdict], locale)} />
    </BrowsePage>
  )
}

function KanaStrip({
  script,
  current,
  locale
}: {
  script: KanaScript
  current: string
  locale: Locale
}) {
  const kana = inScript(gojuonRows, script).flatMap(row =>
    row.cells.flatMap(cell => (cell ? [cell.kana] : []))
  )
  return (
    <nav
      aria-label={browseText(locale).kana.strip}
      lang="ja"
      className="flex flex-wrap gap-0.5 rounded-xl border p-2"
    >
      {kana.map(each =>
        each === current ? (
          <span
            key={each}
            aria-current="page"
            className="inline-flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            {each}
          </span>
        ) : (
          <Link
            key={each}
            href={localizedPath(kanaPath(script, each), locale)}
            className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted"
          >
            {each}
          </Link>
        )
      )}
    </nav>
  )
}

function Neighbor({
  script,
  kana,
  direction,
  locale
}: {
  script: KanaScript
  kana: string | null
  direction: 'previous' | 'next'
  locale: Locale
}) {
  if (!kana) return <span />
  const label = <span lang="ja">{kana}</span>
  return (
    <Link
      href={localizedPath(kanaPath(script, kana), locale)}
      className="inline-flex min-h-11 items-center gap-1.5"
    >
      {direction === 'previous' ? <>← {label}</> : <>{label} →</>}
    </Link>
  )
}

export function KanaInitial({
  script,
  initial,
  heading,
  katakanaPath,
  locale
}: {
  script: KanaScript
  initial: KanaInitialPage
  heading: string
  katakanaPath: string | null
  locale: Locale
}) {
  const t = browseText(locale)
  const kana = <span lang="ja">{initial.initial}</span>
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        locale={locale}
        pages={[
          browseCrumb(locale),
          scriptCrumb(script, locale),
          kanaCrumb(script, initial.initial)
        ]}
      />
      <BrowseHeading title={<span lang="ja">{heading}</span>}>
        <Sentences
          locale={locale}
          sentences={[
            <Fill
              key="count"
              template={counted(t.kana.initialIntro, initial.total, locale)}
              values={{ kana }}
            />,
            katakanaPath ? (
              <Fill
                key="katakana"
                template={t.kana.katakanaUnder}
                values={{
                  link: (
                    <Link
                      href={localizedPath(katakanaPath, locale)}
                      className="underline underline-offset-3"
                    >
                      {t.names.katakana}
                    </Link>
                  )
                }}
              />
            ) : null,
            t.kana.pickNext
          ]}
        />
      </BrowseHeading>
      <KanaStrip script={script} current={initial.initial} locale={locale} />
      <PrefixGrid script={script} prefixes={initial.prefixes} locale={locale} />
      {initial.words.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">
            <Fill template={t.kana.wordsRead} values={{ kana }} />
          </h2>
          <WordList words={initial.words} locale={locale} />
        </section>
      ) : null}
      <nav aria-label={t.kana.neighboringKana} className="flex justify-between border-t pt-5">
        <Neighbor script={script} kana={initial.previous} direction="previous" locale={locale} />
        <Neighbor script={script} kana={initial.next} direction="next" locale={locale} />
      </nav>
      <SourceCredits {...sourceCreditsIn(pageSources.browse, locale)} />
    </BrowsePage>
  )
}

function PrefixGrid({
  script,
  prefixes,
  locale
}: {
  script: KanaScript
  prefixes: readonly KanaCount[]
  locale: Locale
}) {
  const t = browseText(locale)
  return (
    <ul aria-label={t.kana.groups} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {prefixes.map(({ kana, count }) => {
        const pages = pageCount(count)
        const words = formatNumber(count, locale)
        return (
          <li key={kana}>
            <Link
              href={localizedPath(kanaPath(script, kana), locale)}
              className="flex min-h-13 items-center justify-between gap-2 rounded-lg border px-4 hover:bg-muted"
            >
              <span lang="ja" className="text-lg">
                {kana}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {pages > 1
                  ? fill(t.kana.groupPages, { count: words, pages: formatNumber(pages, locale) })
                  : words}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

const siblingsShown = 2

function GroupNeighbors({
  script,
  prefix,
  initial,
  locale
}: {
  script: KanaScript
  prefix: string
  initial: KanaInitialPage
  locale: Locale
}) {
  const { prefixes } = initial
  const position = prefixes.findIndex(({ kana }) => kana === prefix)
  const shown = prefixes.slice(Math.max(0, position - siblingsShown), position + siblingsShown + 1)
  const previous = prefixes[position - 1]?.kana ?? initial.previous
  const next = prefixes[position + 1]?.kana ?? initial.next
  const href = (kana: string) => localizedPath(kanaPath(script, kana), locale)
  const box = 'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm'
  return (
    <nav
      aria-label={browseText(locale).kana.neighboringGroups}
      lang="ja"
      className="flex flex-wrap gap-2"
    >
      {previous ? (
        <Link href={href(previous)} className={`${box} hover:bg-muted`}>
          ← {previous}
        </Link>
      ) : null}
      {shown.map(({ kana }) =>
        kana === prefix ? (
          <span
            key={kana}
            aria-current="page"
            className={`${box} border-primary bg-primary text-primary-foreground`}
          >
            {kana}
          </span>
        ) : (
          <Link key={kana} href={href(kana)} className={`${box} hover:bg-muted`}>
            {kana}
          </Link>
        )
      )}
      {next ? (
        <Link href={href(next)} className={`${box} hover:bg-muted`}>
          {next} →
        </Link>
      ) : null}
    </nav>
  )
}

export function KanaWords({
  script,
  prefix,
  initial,
  words,
  heading,
  page,
  locale
}: {
  script: KanaScript
  prefix: string
  initial: KanaInitialPage
  words: BrowseWordsPage
  heading: string
  page: number
  locale: Locale
}) {
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        locale={locale}
        pages={[
          browseCrumb(locale),
          scriptCrumb(script, locale),
          kanaCrumb(script, initial.initial),
          kanaCrumb(script, prefix)
        ]}
      />
      <BrowseHeading title={<span lang="ja">{heading}</span>}>
        {inKanaOrder(words.total, page, words.pages, locale)}
      </BrowseHeading>
      <GroupNeighbors script={script} prefix={prefix} initial={initial} locale={locale} />
      <WordList words={words.words} section="words" locale={locale} />
      <Pagination
        page={page}
        pages={words.pages}
        pathFor={number => kanaPath(script, prefix, number)}
        locale={locale}
      />
      <SourceCredits {...sourceCreditsIn(pageSources.browse, locale)} />
    </BrowsePage>
  )
}
