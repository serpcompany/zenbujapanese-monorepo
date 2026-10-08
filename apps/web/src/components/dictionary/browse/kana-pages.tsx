import type { KanaCount, KanaIndexResponse } from '@zenbu/dictionary-core/artifact/browse'
import {
  chartKana,
  dakuonRows,
  gojuonRows,
  inScript,
  type KanaScript
} from '@zenbu/dictionary-core/browse/kana'
import { pageCount } from '@zenbu/dictionary-core/browse/lists'
import Link from 'next/link'
import {
  BrowseHeading,
  BrowsePage,
  Chip,
  Chips,
  LinkTabs,
  Pagination
} from '@/components/dictionary/browse/browse-ui'
import { KanaChart } from '@/components/dictionary/browse/kana-chart'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { WordList } from '@/components/dictionary/word-row'
import { formatCount, plural } from '@/lib/dictionary/browse/copy'
import type { BrowseWordsPage, KanaInitialPage } from '@/lib/dictionary/browse/data'
import { browsePath, kanaChartsPath, kanaPath, scriptPath } from '@/lib/dictionary/browse/paths'
import { pageSources, sources } from '@/lib/dictionary/sources'

const scriptNames: Record<KanaScript, string> = { hiragana: 'Hiragana', katakana: 'Katakana' }
const browseCrumb = { label: 'Browse', path: browsePath }
const scriptCrumb = (script: KanaScript) => ({
  label: scriptNames[script],
  path: scriptPath(script)
})

function ScriptTabs({ script }: { script: KanaScript }) {
  return (
    <LinkTabs
      label="Script"
      tabs={(['hiragana', 'katakana'] as const).map(each => ({
        label: scriptNames[each],
        href: scriptPath(each),
        current: each === script
      }))}
      trailing={
        <Link href={kanaChartsPath} className="text-sm text-muted-foreground hover:text-foreground">
          Charts with romaji →
        </Link>
      }
    />
  )
}

function CountChart({
  script,
  counts,
  rows,
  label
}: {
  script: KanaScript
  counts: ReadonlyMap<string, number>
  rows: typeof gojuonRows
  label: string
}) {
  return (
    <KanaChart
      rows={inScript(rows, script)}
      label={label}
      large
      tile={cell => {
        const count = counts.get(cell.kana)
        return count
          ? {
              href: kanaPath(script, cell.kana),
              note: formatCount(count),
              label: `${cell.kana}, ${plural(count, 'word')}`
            }
          : null
      }}
    />
  )
}

export function ScriptIndex({ index, heading }: { index: KanaIndexResponse; heading: string }) {
  const { script, initials } = index
  const counts = new Map(initials.map(({ kana, count }) => [kana, count]))
  const charted = chartKana(script)
  const others = initials.filter(({ kana }) => !charted.has(kana))
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[browseCrumb, { label: 'Kana', path: kanaChartsPath }, scriptCrumb(script)]}
      />
      <BrowseHeading title={heading}>
        {script === 'hiragana'
          ? `${plural(index.total, 'word')}, by the first kana of their reading, so 科学 (かがく) is under か. Each count opens that kana’s words.`
          : `${plural(index.total, 'word')} written in katakana, mostly loanwords, names, and emphasis, by their first character. Each count opens that kana’s words.`}
      </BrowseHeading>
      <ScriptTabs script={script} />
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">
          Gojūon{' '}
          <span lang="ja" className="font-normal whitespace-nowrap text-muted-foreground">
            五十音
          </span>
        </h2>
        <CountChart script={script} counts={counts} rows={gojuonRows} label="Gojūon" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">
          Dakuon and handakuon{' '}
          <span lang="ja" className="font-normal whitespace-nowrap text-muted-foreground">
            濁音・半濁音
          </span>
        </h2>
        <div className="sm:max-w-[50%]">
          <CountChart
            script={script}
            counts={counts}
            rows={dakuonRows}
            label="Dakuon and handakuon"
          />
        </div>
      </section>
      {others.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Other</h2>
          <Chips label="Other kana">
            {others.map(({ kana, count }) => (
              <Chip key={kana} href={kanaPath(script, kana)}>
                <span lang="ja">{kana}</span>
                <span className="text-xs text-muted-foreground">{formatCount(count)}</span>
              </Chip>
            ))}
          </Chips>
        </section>
      ) : null}
      <SourceCredits sources={[sources.jmdict]} />
    </BrowsePage>
  )
}

function KanaStrip({ script, current }: { script: KanaScript; current: string }) {
  const kana = inScript(gojuonRows, script).flatMap(row =>
    row.cells.flatMap(cell => (cell ? [cell.kana] : []))
  )
  return (
    <nav aria-label="Kana" lang="ja" className="flex flex-wrap gap-0.5 rounded-xl border p-2">
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
            href={kanaPath(script, each)}
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
  direction
}: {
  script: KanaScript
  kana: string | null
  direction: 'previous' | 'next'
}) {
  if (!kana) return <span />
  const label = <span lang="ja">{kana}</span>
  return (
    <Link href={kanaPath(script, kana)} className="inline-flex min-h-11 items-center gap-1.5">
      {direction === 'previous' ? <>← {label}</> : <>{label} →</>}
    </Link>
  )
}

export function KanaInitial({
  script,
  initial,
  heading,
  katakanaPath
}: {
  script: KanaScript
  initial: KanaInitialPage
  heading: string
  katakanaPath: string | null
}) {
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[
          browseCrumb,
          scriptCrumb(script),
          { label: initial.initial, path: kanaPath(script, initial.initial), lang: 'ja' }
        ]}
      />
      <BrowseHeading title={<span lang="ja">{heading}</span>}>
        {plural(initial.total, 'word')} whose reading starts with{' '}
        <span lang="ja">{initial.initial}</span>.{' '}
        {katakanaPath ? (
          <>
            Words written in katakana are under{' '}
            <Link href={katakanaPath} className="underline underline-offset-3">
              Katakana
            </Link>
            .{' '}
          </>
        ) : null}
        Pick the next kana to see them.
      </BrowseHeading>
      <KanaStrip script={script} current={initial.initial} />
      <PrefixGrid script={script} prefixes={initial.prefixes} />
      {initial.words.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">
            Words read <span lang="ja">{initial.initial}</span>
          </h2>
          <WordList words={initial.words} />
        </section>
      ) : null}
      <nav aria-label="Neighboring kana" className="flex justify-between border-t pt-5">
        <Neighbor script={script} kana={initial.previous} direction="previous" />
        <Neighbor script={script} kana={initial.next} direction="next" />
      </nav>
      <SourceCredits sources={pageSources.browse} />
    </BrowsePage>
  )
}

function PrefixGrid({ script, prefixes }: { script: KanaScript; prefixes: readonly KanaCount[] }) {
  return (
    <ul aria-label="Two-kana groups" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {prefixes.map(({ kana, count }) => {
        const pages = pageCount(count)
        return (
          <li key={kana}>
            <Link
              href={kanaPath(script, kana)}
              className="flex min-h-13 items-center justify-between gap-2 rounded-lg border px-4 hover:bg-muted"
            >
              <span lang="ja" className="text-lg">
                {kana}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatCount(count)}
                {pages > 1 ? ` · ${pages} pages` : ''}
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
  initial
}: {
  script: KanaScript
  prefix: string
  initial: KanaInitialPage
}) {
  const { prefixes } = initial
  const position = prefixes.findIndex(({ kana }) => kana === prefix)
  const shown = prefixes.slice(Math.max(0, position - siblingsShown), position + siblingsShown + 1)
  const previous = prefixes[position - 1]?.kana ?? initial.previous
  const next = prefixes[position + 1]?.kana ?? initial.next
  const box = 'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm'
  return (
    <nav aria-label="Neighboring groups" lang="ja" className="flex flex-wrap gap-2">
      {previous ? (
        <Link href={kanaPath(script, previous)} className={`${box} hover:bg-muted`}>
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
          <Link key={kana} href={kanaPath(script, kana)} className={`${box} hover:bg-muted`}>
            {kana}
          </Link>
        )
      )}
      {next ? (
        <Link href={kanaPath(script, next)} className={`${box} hover:bg-muted`}>
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
  page
}: {
  script: KanaScript
  prefix: string
  initial: KanaInitialPage
  words: BrowseWordsPage
  heading: string
  page: number
}) {
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[
          browseCrumb,
          scriptCrumb(script),
          { label: initial.initial, path: kanaPath(script, initial.initial), lang: 'ja' },
          { label: prefix, path: kanaPath(script, prefix), lang: 'ja' }
        ]}
      />
      <BrowseHeading title={<span lang="ja">{heading}</span>}>
        {plural(words.total, 'word')}, in kana order
        {words.pages > 1 ? `, page ${page} of ${words.pages}` : ''}.
      </BrowseHeading>
      <GroupNeighbors script={script} prefix={prefix} initial={initial} />
      <WordList words={words.words} section="words" />
      <Pagination
        page={page}
        pages={words.pages}
        pathFor={number => kanaPath(script, prefix, number)}
      />
      <SourceCredits sources={pageSources.browse} />
    </BrowsePage>
  )
}
