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
import { type ConversionTable as ConversionTableData, conversionTable } from '@/lib/tools/table'

type Group = ConversionTableData['groups'][number]

function ChartTable({
  group,
  labelledBy
}: {
  group: Extract<Group, { kind: 'chart' }>
  labelledBy: string
}) {
  return (
    <Table aria-labelledby={labelledBy}>
      <TableHeader>
        <TableRow>
          <TableHead>
            <span className="sr-only">Row</span>
          </TableHead>
          {group.headings.map(heading => (
            <TableHead key={heading} lang="ja-Latn">
              {heading}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {group.rows.map(row => (
          <TableRow key={row.label}>
            <TableHead scope="row" lang="ja-Latn">
              {row.label}
            </TableHead>
            {row.cells.map(({ column, entry }) =>
              entry ? (
                <TableCell key={column} data-kana={entry.kana}>
                  <span lang="ja" className="block">
                    {entry.pair}
                  </span>
                  <span lang="ja-Latn" className="block text-muted-foreground">
                    {entry.romaji}
                  </span>
                </TableCell>
              ) : (
                <TableCell key={column} />
              )
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ListTable({
  group,
  labelledBy
}: {
  group: Extract<Group, { kind: 'list' }>
  labelledBy: string
}) {
  return (
    <Table aria-labelledby={labelledBy}>
      <TableHeader>
        <TableRow>
          {group.columns.map(column => (
            <TableHead key={column.heading}>{column.heading}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {group.rows.map(row => (
          <TableRow key={row.kana} data-kana={row.kana}>
            {group.columns.map((column, index) => (
              <TableCell
                key={column.heading}
                lang={row.cells[index].lang}
                className={column.wraps ? 'whitespace-normal' : undefined}
              >
                {row.cells[index].text}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ConversionTable({ slug }: { slug: ConverterSlug }) {
  const table = conversionTable(slug)
  const id = `${slug}-rows`
  return (
    <ToolSection
      title="Conversion table"
      line={table.line}
      aside={<ArrowLink href={kanaChartsPath}>Full kana charts, with common words</ArrowLink>}
    >
      <Tabs defaultValue={table.groups[0]?.id}>
        <TabsList aria-label="Kana groups">
          {table.groups.map(group => (
            <TabsTrigger key={group.id} value={group.id}>
              {group.tab}
            </TabsTrigger>
          ))}
        </TabsList>
        {table.groups.map(group => (
          <TabsContent key={group.id} value={group.id} keepMounted>
            <div className="flex w-fit max-w-full flex-col gap-2">
              <p id={`${id}-${group.id}`} className="font-semibold">
                {group.label}, {group.count}
              </p>
              {group.kind === 'chart' ? (
                <ChartTable group={group} labelledBy={`${id}-${group.id}`} />
              ) : (
                <ListTable group={group} labelledBy={`${id}-${group.id}`} />
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </ToolSection>
  )
}
