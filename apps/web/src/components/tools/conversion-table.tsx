'use client'

import { useState } from 'react'
import { ChoiceToggles } from '@/components/tools/choice-toggles'
import { ToolSection } from '@/components/tools/tool-section'
import { cellPadding, ToolTable } from '@/components/tools/tool-table'
import type { ConverterSlug } from '@/lib/tools/paths'
import type { KanaGroupId } from '@/lib/tools/reference'
import { conversionTable, type TableColumn } from '@/lib/tools/table'
import { cn } from '@/lib/utils'

type Shown = 'all' | KanaGroupId

const cellClassName = (column: TableColumn) =>
  cn(
    cellPadding,
    'py-2 align-middle',
    column.writing === 'japanese' ? 'text-[17px] whitespace-nowrap' : 'text-sm sm:font-mono',
    column.quiet && 'text-muted-foreground'
  )

export function ConversionTable({ slug }: { slug: ConverterSlug }) {
  const table = conversionTable(slug)
  const [shown, setShown] = useState<Shown>('all')
  const choices = [
    { value: 'all' as const, label: 'All' },
    ...table.groups.map(group => ({ value: group.id, label: group.label }))
  ]
  return (
    <ToolSection title="Conversion table" line={table.line} className="max-w-3xl">
      <ChoiceToggles label="Rows" choices={choices} chosen={shown} onChoose={setShown} />
      <ToolTable headings={table.columns.map(column => column.heading)}>
        {table.groups.map(group => (
          <tbody key={group.id} hidden={shown !== 'all' && shown !== group.id}>
            <tr className="border-t">
              <th
                colSpan={table.columns.length}
                scope="rowgroup"
                className={cn(cellPadding, 'muted-surface bg-muted py-2 text-sm font-semibold')}
              >
                {group.label}
                <span className="ml-1.5 font-medium text-muted-foreground">
                  {group.rows.length}
                </span>
              </th>
            </tr>
            {group.rows.map(row => (
              <tr key={row.join('|')} className="border-t hover:bg-muted/40">
                {table.columns.map((column, index) => (
                  <td
                    key={column.heading}
                    lang={column.writing === 'japanese' ? 'ja' : 'ja-Latn'}
                    className={cellClassName(column)}
                  >
                    {row[index]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </ToolTable>
    </ToolSection>
  )
}
