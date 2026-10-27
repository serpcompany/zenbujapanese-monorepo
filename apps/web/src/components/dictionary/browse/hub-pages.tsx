import type { BrowseSummaryResponse } from '@zenbu/dictionary-core/artifact/browse'
import { commonWords } from '@zenbu/dictionary-core/browse/categories'
import {
  dakuonRows,
  gojuonRows,
  inScript,
  type KanaScript
} from '@zenbu/dictionary-core/browse/kana'
import {
  allRankBands,
  gradeLists,
  jlptKanjiLists,
  jlptLists,
  secondarySchool
} from '@zenbu/dictionary-core/browse/lists'
import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { SourceCredits } from '@zenbu/ui/dictionary/source-credits'
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
import { browseText, counted, kanjiListName, rankRange } from '@/lib/dictionary/browse/copy'
import {
  browsePath,
  categoryPath,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  kanaChartsPath,
  kanaPath,
  kanjiListPath,
  kanjiListsPath,
  rankBandPath,
  scriptPath,
  strokeCountsPath
} from '@/lib/dictionary/browse/paths'
import { sourceCreditsIn } from '@/lib/dictionary/screen-text'
import type { Locale } from '@/lib/i18n/config'
import { fill, formatNumber } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'

const nativeNames: Record<KanaScript, string> = { hiragana: 'ひらがな', katakana: 'カタカナ' }

const kanaTile =
  (script: KanaScript, initials: ReadonlySet<string>, withRomaji: boolean, noWords: string) =>
  (cell: { kana: string; romaji: string }): KanaTile => {
    const note = withRomaji ? cell.romaji : undefined
    return initials.has(cell.kana)
      ? { href: kanaPath(script, cell.kana), note }
      : { href: null, note, label: noWords, muted: true }
  }

export function KanaCharts({
  script,
  initials,
  withRomaji = false,
  locale
}: {
  script: KanaScript
  initials: ReadonlySet<string>
  withRomaji?: boolean
  locale: Locale
}) {
  const t = browseText(locale)
  const tile = kanaTile(script, initials, withRomaji, t.kana.noWords)
  const name = t.names[script]
  return (
    <>
      <KanaChart
        rows={inScript(gojuonRows, script)}
        tile={tile}
        large={withRomaji}
        label={fill(t.kana.chartOf.gojuon, { script: name })}
        locale={locale}
      />
      <KanaChart
        rows={inScript(dakuonRows, script)}
        tile={tile}
        large={withRomaji}
        className="sm:max-w-[46%]"
        label={fill(t.kana.chartOf.dakuon, { script: name })}
        locale={locale}
      />
    </>
  )
}

function ScriptCard({
  script,
  count,
  initials,
  locale
}: {
  script: KanaScript
  count: number
  initials: ReadonlySet<string>
  locale: Locale
}) {
  const t = browseText(locale)
  return (
    <Panel label={t.names[script]}>
      <PanelHeading title={t.names[script]} href={scriptPath(script)} locale={locale} />
      <p className="text-sm text-muted-foreground">
        {counted(t.hub.scriptCard[script], count, locale)}
      </p>
      <KanaCharts script={script} initials={initials} locale={locale} />
      <MoreLink href={scriptPath(script)} locale={locale}>
        {t.hub.allScript[script]}
      </MoreLink>
    </Panel>
  )
}

type ScriptInitials = Record<KanaScript, ReadonlySet<string>>

type HubProps = {
  summary: BrowseSummaryResponse
  initials: ScriptInitials
  locale: Locale
}

const browseHubCrumb = (locale: Locale) => ({
  label: browseText(locale).names.browse,
  path: browsePath
})

function KanjiPanel({ summary, locale }: { summary: BrowseSummaryResponse; locale: Locale }) {
  const t = browseText(locale)
  return (
    <Panel label={t.names.kanji}>
      <PanelHeading title={t.names.kanji} href={kanjiListsPath} locale={locale} />
      <p className="text-sm text-muted-foreground">
        {fill(t.hub.kanjiCard, { count: formatNumber(summary.kanji.joyo, locale) })}
      </p>
      <Chips label={t.names.kanjiLists}>
        {[...gradeLists.slice(0, 3), secondarySchool, ...jlptKanjiLists.slice(0, 2)].map(list => (
          <Chip key={list.slug} href={kanjiListPath(list.slug)} locale={locale}>
            {kanjiListName(list, locale)}
          </Chip>
        ))}
        <Chip href={strokeCountsPath} locale={locale}>
          {t.names.byStrokeCount}
        </Chip>
      </Chips>
      <MoreLink href={kanjiListsPath} locale={locale}>
        {t.hub.allKanjiLists}
      </MoreLink>
    </Panel>
  )
}

function FrequencyPanel({ summary, locale }: { summary: BrowseSummaryResponse; locale: Locale }) {
  const t = browseText(locale)
  return (
    <Panel label={t.names.frequency}>
      <PanelHeading title={t.names.frequency} href={frequencyDictionariesPath} locale={locale} />
      <p className="text-sm text-muted-foreground">{t.hub.frequencyCard}</p>
      <p className="text-sm font-medium">{t.names.jlptVocabulary}</p>
      <Chips label={t.names.jlptVocabulary}>
        {jlptLists.map(list => {
          const count = summary.jlpt.find(each => each.slug === list.slug)?.count ?? 0
          return (
            <Chip key={list.slug} href={jlptVocabularyPath(list.level)} locale={locale}>
              {fill(t.hub.jlptChip, { level: list.level, count: formatNumber(count, locale) })}
            </Chip>
          )
        })}
      </Chips>
      <p className="text-sm font-medium">{t.hub.mostUsedOnYouTube}</p>
      <Chips label={t.hub.mostUsedOnYouTube}>
        {allRankBands.map(band => (
          <Chip key={band.band} href={rankBandPath('youtube', band.band)} locale={locale}>
            {rankRange(band, locale)}
          </Chip>
        ))}
      </Chips>
      <MoreLink href={frequencyDictionariesPath} locale={locale}>
        {t.hub.allFrequency}
      </MoreLink>
    </Panel>
  )
}

export function BrowseHub({ summary, initials, locale }: HubProps) {
  const t = browseText(locale)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs locale={locale} pages={[browseHubCrumb(locale)]} />
      <BrowseHeading title={t.hub.title}>
        {fill(t.hub.intro, { count: formatNumber(summary.entries, locale) })}
      </BrowseHeading>
      {(['hiragana', 'katakana'] as const).map(script => (
        <ScriptCard
          key={script}
          script={script}
          count={summary.scripts[script]}
          initials={initials[script]}
          locale={locale}
        />
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        <KanjiPanel summary={summary} locale={locale} />
        <FrequencyPanel summary={summary} locale={locale} />
      </div>
      <CategoryChipCards locale={locale} />
      <Panel label={t.names.commonWords} className="sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t.names.commonWords}</h2>
          <p className="text-sm text-muted-foreground">
            {counted(t.hub.commonCard, summary.common, locale)}
          </p>
        </div>
        <Link
          href={localizedPath(categoryPath(commonWords.slug), locale)}
          className="inline-flex min-h-11 items-center self-start rounded-lg border px-4 hover:bg-muted"
        >
          {t.hub.browseCommon}
        </Link>
      </Panel>
      <SourceCredits
        {...sourceCreditsIn([sourceCredits.jmdict, sourceCredits.kanjidic2], locale)}
      />
    </BrowsePage>
  )
}

export function KanaChartsPage({ summary, initials, locale }: HubProps) {
  const t = browseText(locale)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        locale={locale}
        pages={[browseHubCrumb(locale), { label: t.names.kana, path: kanaChartsPath }]}
      />
      <BrowseHeading title={t.kana.chartsTitle}>{t.kana.chartsIntro}</BrowseHeading>
      {(['hiragana', 'katakana'] as const).map(script => (
        <Panel key={script} label={t.names[script]}>
          <PanelHeading
            title={t.names[script]}
            locale={locale}
            aside={
              <Link
                href={localizedPath(scriptPath(script), locale)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {counted(t.counts.words, summary.scripts[script], locale)}
              </Link>
            }
          />
          {nativeNames[script] === t.names[script] ? null : (
            <p lang="ja" className="-mt-2 text-muted-foreground">
              {nativeNames[script]}
            </p>
          )}
          <KanaCharts script={script} initials={initials[script]} withRomaji locale={locale} />
        </Panel>
      ))}
      <SourceCredits {...sourceCreditsIn([sourceCredits.jmdict], locale)} />
    </BrowsePage>
  )
}
