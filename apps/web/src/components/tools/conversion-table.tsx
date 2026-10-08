'use client'

import { useId, useState } from 'react'
import { ChoiceToggles } from '@/components/tools/choice-toggles'
import { ToolSection } from '@/components/tools/tool-section'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import type { ConverterSlug } from '@/lib/tools/paths'
import type { KanaGroupId } from '@/lib/tools/reference'
import { conversionTable } from '@/lib/tools/table'
import { cn } from '@/lib/utils'

type Shown = 'all' | KanaGroupId

export function ConversionTable({ slug }: { slug: ConverterSlug }) {
  const table = conversionTable(slug)
  const [shown, setShown] = useState<Shown>('all')
  const headings = useId()
  const choices = [
    { value: 'all' as const, label: 'All' },
    ...table.groups.map(group => ({ value: group.id, label: group.label }))
  ]
  return (
    <ToolSection title="Conversion table" line={table.line}>
      <ChoiceToggles
        label="Rows"
        choices={choices}
        chosen={shown}
        onChoose={setShown}
        className="flex-wrap"
      />
      <div
        className={cn(
          'gap-8',
          table.columns.length > 3 ? 'md:columns-2' : 'sm:columns-2 lg:columns-3'
        )}
      >
        {table.groups.map(group => (
          <section
            key={group.id}
            aria-labelledby={`${headings}-${group.id}`}
            hidden={shown !== 'all' && shown !== group.id}
            className="mb-8 break-inside-avoid"
          >
            <h3 id={`${headings}-${group.id}`} className="mb-2 text-sm font-medium">
              {group.label} <span className="text-muted-foreground">{group.rows.length}</span>
            </h3>
            <Table>
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
                        className={column.quiet ? 'text-muted-foreground' : undefined}
                      >
                        {row[index].text}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ))}
      </div>
    </ToolSection>
  )
}
