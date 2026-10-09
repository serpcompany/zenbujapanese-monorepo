import { Panel } from '@/components/dictionary/browse/browse-ui'
import { KanaChart } from '@/components/dictionary/browse/kana-chart'
import { ArrowLink, ToolSection } from '@/components/tools/tool-section'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { kanaChartsPath } from '@/lib/dictionary/browse/paths'
import { conversionChart } from '@/lib/tools/chart'
import type { ConverterSlug } from '@/lib/tools/paths'
import type { KanaGroupId } from '@/lib/tools/reference'

const widths: Record<KanaGroupId, string> = {
  basic: 'break-keep',
  marks: 'break-keep sm:w-5/11',
  combinations: 'break-keep',
  small: 'break-keep sm:w-4/11',
  extended: 'break-keep sm:w-8/11'
}

export function ConversionChart({ slug }: { slug: ConverterSlug }) {
  const chart = conversionChart(slug)
  return (
    <ToolSection
      title="Conversion chart"
      line={chart.line}
      aside={<ArrowLink href={kanaChartsPath}>Full kana charts, with common words</ArrowLink>}
    >
      <Panel>
        <Tabs defaultValue={chart.groups[0]?.id}>
          <TabsList aria-label="Kana groups">
            {chart.groups.map(group => (
              <TabsTrigger key={group.id} value={group.id}>
                {group.tab}
              </TabsTrigger>
            ))}
          </TabsList>
          {chart.groups.map(group => (
            <TabsContent key={group.id} value={group.id} keepMounted>
              <div className="flex flex-col gap-3 pt-2">
                <h3 className="font-medium">
                  {group.label} <span className="text-muted-foreground">{group.count}</span>
                </h3>
                <KanaChart
                  rows={group.rows}
                  label={group.label}
                  sounds={group.sounds}
                  large
                  className={widths[group.id]}
                  tile={cell => ({ href: null, note: cell.romaji })}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Panel>
    </ToolSection>
  )
}
