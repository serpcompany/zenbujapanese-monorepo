import type { KanaCell, KanaRow } from '@zenbu/dictionary-core/browse/kana'
import { cn } from 'cn'
import Link from 'next/link'

export interface KanaTile {
  href: string | null
  note?: string
  label?: string
}

export function KanaChart({
  rows,
  tile,
  label,
  large = false,
  className
}: {
  rows: readonly KanaRow[]
  tile: (cell: KanaCell) => KanaTile | null
  label: string
  large?: boolean
  className?: string
}) {
  const cells = rows.flatMap(({ consonant, cells: row }) =>
    row.map((cell, index) => ({ key: `${consonant}${index}${cell?.kana ?? ''}`, cell }))
  )
  return (
    <ul
      aria-label={label}
      lang="ja"
      className={cn(
        'grid grid-cols-5 gap-1.5 sm:auto-cols-fr sm:grid-flow-col sm:grid-rows-5 sm:grid-cols-none',
        className
      )}
    >
      {cells.map(({ key, cell }) => {
        const shown = cell ? tile(cell) : null
        if (!cell || !shown) return <li key={key} aria-hidden="true" />
        const tileClass = cn(
          'flex h-full flex-col items-center justify-center gap-0.5 rounded-lg border',
          large ? 'min-h-16 py-1.5' : 'min-h-11',
          shown.href ? 'hover:bg-muted' : 'border-dashed text-muted-foreground'
        )
        const contents = (
          <>
            <span className={large ? 'text-xl leading-none sm:text-2xl' : 'text-lg leading-none'}>
              {cell.kana}
            </span>
            {shown.note ? (
              <span lang="en" className="text-xs text-muted-foreground tabular-nums">
                {shown.note}
              </span>
            ) : null}
          </>
        )
        return (
          <li key={key}>
            {shown.href ? (
              <Link href={shown.href} aria-label={shown.label} className={tileClass}>
                {contents}
              </Link>
            ) : (
              <span className={tileClass}>
                {contents}
                {shown.label ? <span className="sr-only">, {shown.label}</span> : null}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
