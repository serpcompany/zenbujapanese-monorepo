import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { menuSymbols } from '@/components/site-menu-item'
import { Card } from '@/components/ui/card'
import { convert } from '@/lib/tools/convert'
import { type Converter, converterFor, languageOf } from '@/lib/tools/converters'
import type { ConverterSlug } from '@/lib/tools/paths'
import type { ToolMark } from '@/lib/tools/reference-tools'

function MarkTile({ mark }: { mark: ToolMark }) {
  const className =
    'grid size-8 shrink-0 place-items-center rounded-md bg-muted text-[15px] font-medium text-foreground'
  if ('glyph' in mark) {
    return (
      <span lang="ja" aria-hidden="true" className={className}>
        {mark.glyph}
      </span>
    )
  }
  const Icon = menuSymbols[mark.symbol]
  return (
    <span aria-hidden="true" className={className}>
      <Icon className="size-4" />
    </span>
  )
}

export function ToolCard({
  title,
  line,
  href,
  mark,
  children
}: {
  title: string
  line: string
  href: string
  mark: ToolMark
  children?: ReactNode
}) {
  return (
    <Card className="relative h-full gap-2 px-4.5 py-4 hover:bg-muted/40">
      <div className="flex items-center justify-between">
        <MarkTile mark={mark} />
        <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="text-muted-foreground">{line}</p>
      {children}
      <Link
        href={href}
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="sr-only">{title}</span>
      </Link>
    </Card>
  )
}

function ConverterSample({ converter }: { converter: Converter }) {
  const result = convert(converter.slug, converter.card.sample)
  return (
    <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[15px]">
      <span lang={languageOf[converter.input]}>{converter.card.sample}</span>
      <span aria-hidden="true" className="text-muted-foreground">
        →
      </span>
      <span className="sr-only">becomes</span>
      <span lang={languageOf[converter.output]}>{result}</span>
    </p>
  )
}

export function ConverterCard({ slug }: { slug: ConverterSlug }) {
  const converter = converterFor(slug)
  return (
    <ToolCard
      title={converter.name}
      line={converter.card.line}
      href={converter.path}
      mark={{ glyph: converter.card.mark }}
    >
      <ConverterSample converter={converter} />
    </ToolCard>
  )
}

export function CardGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </ul>
  )
}
