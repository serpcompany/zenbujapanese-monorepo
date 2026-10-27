import { Tabs, TabsContent, TabsList, TabsTrigger } from '@zenbu/ui/components/tabs'
import { cn } from 'cn'
import { Panel } from '@/components/dictionary/browse/browse-ui'
import { KanaChart } from '@/components/dictionary/browse/kana-chart'
import { ArrowLink, ToolSection } from '@/components/tools/tool-section'
import { kanaChartsPath } from '@/lib/dictionary/browse/paths'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { type ChartGroup, conversionChart } from '@/lib/tools/chart'
import type { ConverterSlug } from '@/lib/tools/paths'
import type { KanaGroupId } from '@/lib/tools/reference'

const widths: Record<KanaGroupId, string | undefined> = {
  basic: undefined,
  marks: 'sm:w-5/11',
  small: 'sm:w-4/11',
  combinations: undefined,
  extended: 'sm:w-8/11'
}

function Group({ group, locale }: { group: ChartGroup; locale: Locale }) {
  const text = getDictionary(locale).tools.chart
  const noteLang = (romaji: string) => (romaji === text.smallTsu ? locale : undefined)
  return (
    <div className={cn('flex flex-col gap-3', widths[group.id])}>
      <h3 className="font-medium">
        {group.label} <span className="text-muted-foreground">{group.count}</span>
      </h3>
      <KanaChart
        rows={group.rows}
        label={group.label}
        sounds={group.sounds}
        large
        locale={locale}
        className="break-keep sm:whitespace-pre-line"
        tile={cell =>
          group.unchanged.includes(cell.kana)
            ? {
                href: null,
                note: cell.romaji,
                noteLang: noteLang(cell.romaji),
                label: text.noHalfWidth,
                muted: true
              }
            : { href: null, note: cell.romaji, noteLang: noteLang(cell.romaji) }
        }
      />
    </div>
  )
}

export function ConversionChart({ slug, locale }: { slug: ConverterSlug; locale: Locale }) {
  const text = getDictionary(locale).tools.chart
  const chart = conversionChart(slug, locale)
  return (
    <ToolSection
      title={text.title}
      line={chart.line}
      aside={<ArrowLink href={localizedPath(kanaChartsPath, locale)}>{text.fullCharts}</ArrowLink>}
    >
      <Panel>
        <Tabs defaultValue={chart.tabs[0]?.id}>
          <TabsList aria-label={text.groupsLabel}>
            {chart.tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.tab}
              </TabsTrigger>
            ))}
          </TabsList>
          {chart.tabs.map(tab => (
            <TabsContent key={tab.id} value={tab.id} keepMounted>
              <div className="flex flex-col gap-6 pt-2">
                {tab.groups.slice(0, 1).map(group => (
                  <Group key={group.id} group={group} locale={locale} />
                ))}
                {tab.groups.length > 1 ? (
                  <div className="flex flex-col gap-6 sm:flex-row">
                    {tab.groups.slice(1).map(group => (
                      <Group key={group.id} group={group} locale={locale} />
                    ))}
                  </div>
                ) : null}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Panel>
    </ToolSection>
  )
}
