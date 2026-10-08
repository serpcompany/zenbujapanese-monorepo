import { ArrowLink, ToolSection } from '@/components/tools/tool-section'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { kanaChartsPath } from '@/lib/dictionary/browse/paths'
import type { ConverterSlug } from '@/lib/tools/paths'
import { conversionTable } from '@/lib/tools/table'

export function ConversionTable({ slug }: { slug: ConverterSlug }) {
  const table = conversionTable(slug)
  return (
    <ToolSection
      title="Conversion table"
      line={table.line}
      aside={<ArrowLink href={kanaChartsPath}>Full kana charts, with common words</ArrowLink>}
    >
      <Tabs defaultValue={table.groups[0]?.id}>
        <div className="max-w-full overflow-x-auto">
          <TabsList aria-label="Rows">
            {table.groups.map(group => (
              <TabsTrigger key={group.id} value={group.id}>
                {group.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {table.groups.map(group => (
          <TabsContent key={group.id} value={group.id} keepMounted>
            <div className="w-fit max-w-full">
              <Table aria-label={`${group.label}, ${group.rows.length} rows`}>
                <TableHeader>
                  <TableRow>
                    {table.columns.map(column => (
                      <TableHead key={column.heading}>{column.heading}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map(row => (
                    <TableRow key={row.map(cell => cell.text).join('|')}>
                      {table.columns.map((column, index) => (
                        <TableCell
                          key={column.heading}
                          lang={row[index].lang}
                          className={
                            column.wraps || row[index].lang === 'en'
                              ? 'whitespace-normal'
                              : undefined
                          }
                        >
                          {row[index].text}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </ToolSection>
  )
}
