import type { BrowseSummaryResponse } from '@zenbu/dictionary-core/artifact/browse'
import { commonWords } from '@zenbu/dictionary-core/browse/categories'
import {
  dakuonRows,
  gojuonRows,
  inScript,
  type KanaScript
} from '@zenbu/dictionary-core/browse/kana'
import {
  gradeLists,
  jlptKanjiLists,
  jlptLists,
  secondarySchool
} from '@zenbu/dictionary-core/browse/lists'
import Link from 'next/link'
import {
  BrowseHeading,
  BrowsePage,
  Chip,
  Chips,
  MoreLink,
  Panel,
  PanelHeading
} from '@/components/dictionary/browse/browse-ui'
import { CategoryChipCards } from '@/components/dictionary/browse/category-links'
import { KanaChart, type KanaTile } from '@/components/dictionary/browse/kana-chart'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { formatCount, plural } from '@/lib/dictionary/browse/copy'
import {
  browsePath,
  categoryPath,
  frequencyDictionariesPath,
  kanaChartsPath,
  kanaPath,
  kanjiListPath,
  kanjiListsPath,
  rankBandPath,
  rankedListPath,
  scriptPath,
  strokeCountsPath
} from '@/lib/dictionary/browse/paths'
import { sources } from '@/lib/dictionary/sources'

const scriptNames: Record<KanaScript, { name: string; native: string }> = {
  hiragana: { name: 'Hiragana', native: 'ひらがな' },
  katakana: { name: 'Katakana', native: 'カタカナ' }
}

const kanaTile =
  (script: KanaScript, initials: ReadonlySet<string>, withRomaji: boolean) =>
  (cell: { kana: string; romaji: string }): KanaTile => {
    const note = withRomaji ? cell.romaji : undefined
    return initials.has(cell.kana)
      ? { href: kanaPath(script, cell.kana), note }
      : { href: null, note, label: 'no words start with it' }
  }

export function KanaCharts({
  script,
  initials,
  withRomaji = false
}: {
  script: KanaScript
  initials: ReadonlySet<string>
  withRomaji?: boolean
}) {
  const tile = kanaTile(script, initials, withRomaji)
  return (
    <>
      <KanaChart
        rows={inScript(gojuonRows, script)}
        tile={tile}
        large={withRomaji}
        label={`${scriptNames[script].name} gojūon`}
      />
      <KanaChart
        rows={inScript(dakuonRows, script)}
        tile={tile}
        large={withRomaji}
        className="sm:max-w-[46%]"
        label={`${scriptNames[script].name} dakuon and handakuon`}
      />
    </>
  )
}

function ScriptCard({
  script,
  count,
  initials
}: {
  script: KanaScript
  count: number
  initials: ReadonlySet<string>
}) {
  return (
    <Panel label={scriptNames[script].name}>
      <PanelHeading title={scriptNames[script].name} href={scriptPath(script)} />
      <p className="text-sm text-muted-foreground">
        {script === 'hiragana'
          ? `${plural(count, 'word')}, by the first kana of their reading`
          : `${plural(count, 'word')} written in katakana, mostly loanwords`}
      </p>
      <KanaCharts script={script} initials={initials} />
      <MoreLink href={scriptPath(script)}>All {scriptNames[script].name.toLowerCase()}</MoreLink>
    </Panel>
  )
}

const youtubeBands = Array.from({ length: 10 }, (_, index) => index * 1_000 + 1)

export type ScriptInitials = Record<KanaScript, ReadonlySet<string>>

export function BrowseHub({
  summary,
  initials
}: {
  summary: BrowseSummaryResponse
  initials: ScriptInitials
}) {
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs pages={[{ label: 'Browse', path: browsePath }]} />
      <BrowseHeading title="Browse the Japanese dictionary">
        All {formatCount(summary.entries)} entries, by how they’re written, by kanji, by how common
        they are, and by what kind of word they are.
      </BrowseHeading>
      <ScriptCard script="hiragana" count={summary.scripts.hiragana} initials={initials.hiragana} />
      <ScriptCard script="katakana" count={summary.scripts.katakana} initials={initials.katakana} />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel label="Kanji">
          <PanelHeading title="Kanji" href={kanjiListsPath} />
          <p className="text-sm text-muted-foreground">
            {formatCount(summary.kanji.joyo)} jōyō kanji by school grade and stroke count, and kanji
            by JLPT level
          </p>
          <Chips label="Kanji lists">
            {gradeLists.slice(0, 3).map(list => (
              <Chip key={list.slug} href={kanjiListPath(list.slug)}>
                {list.name}
              </Chip>
            ))}
            <Chip href={kanjiListPath(secondarySchool.slug)}>{secondarySchool.name}</Chip>
            {jlptKanjiLists.slice(0, 2).map(list => (
              <Chip key={list.slug} href={kanjiListPath(list.slug)}>
                {list.name}
              </Chip>
            ))}
            <Chip href={strokeCountsPath}>By stroke count</Chip>
          </Chips>
          <MoreLink href={kanjiListsPath}>All kanji lists</MoreLink>
        </Panel>
        <Panel label="Frequency dictionaries">
          <PanelHeading title="Frequency dictionaries" href={frequencyDictionariesPath} />
          <p className="text-sm text-muted-foreground">
            Words ranked by how often they’re used, and the JLPT vocabulary lists
          </p>
          <p className="text-sm font-medium">JLPT vocabulary</p>
          <Chips label="JLPT vocabulary">
            {jlptLists.map(list => {
              const count = summary.jlpt.find(each => each.slug === list.slug)?.count ?? 0
              return (
                <Chip key={list.slug} href={rankedListPath(list.slug)}>
                  N{list.level} · {formatCount(count)}
                </Chip>
              )
            })}
          </Chips>
          <p className="text-sm font-medium">Most used on YouTube</p>
          <Chips label="Most used on YouTube">
            {youtubeBands.map(first => (
              <Chip key={first} href={rankBandPath('youtube', first)}>
                {formatCount(first)}–{formatCount(first + 999)}
              </Chip>
            ))}
          </Chips>
          <MoreLink href={frequencyDictionariesPath}>All frequency dictionaries</MoreLink>
        </Panel>
      </div>
      <CategoryChipCards />
      <Panel label="Common words" className="sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Common words</h2>
          <p className="text-sm text-muted-foreground">
            {plural(summary.common, 'word')} JMdict marks as common
          </p>
        </div>
        <Link
          href={categoryPath(commonWords.slug)}
          className="inline-flex min-h-11 items-center self-start rounded-lg border px-4 hover:bg-muted"
        >
          Browse common words →
        </Link>
      </Panel>
      <SourceCredits sources={[sources.jmdict, sources.kanjidic2]} />
    </BrowsePage>
  )
}

export function KanaChartsPage({
  summary,
  initials
}: {
  summary: BrowseSummaryResponse
  initials: ScriptInitials
}) {
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[
          { label: 'Browse', path: browsePath },
          { label: 'Kana', path: kanaChartsPath }
        ]}
      />
      <BrowseHeading title="Hiragana and katakana charts">
        Japanese has two kana scripts with the same 46 sounds. Hiragana writes native words and
        grammar; katakana writes loanwords and emphasis. Pick a kana to see every word that starts
        with it.
      </BrowseHeading>
      {(['hiragana', 'katakana'] as const).map(script => (
        <Panel key={script} label={scriptNames[script].name}>
          <PanelHeading
            title={scriptNames[script].name}
            aside={
              <Link
                href={scriptPath(script)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {plural(summary.scripts[script], 'word')}
              </Link>
            }
          />
          <p lang="ja" className="-mt-2 text-muted-foreground">
            {scriptNames[script].native}
          </p>
          <KanaCharts script={script} initials={initials[script]} withRomaji />
        </Panel>
      ))}
      <SourceCredits sources={[sources.jmdict]} />
    </BrowsePage>
  )
}
