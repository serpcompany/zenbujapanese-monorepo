import Link from 'next/link'
import type { ReactNode } from 'react'
import { ProductMarkTile } from '@/components/products/product-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import type { ProductMark } from '@/lib/products/catalog'
import { convert } from '@/lib/tools/convert'
import { languageOf } from '@/lib/tools/converters'
import type { ConverterSlug } from '@/lib/tools/paths'
import { converterPageIn } from '@/lib/tools/tool-pages'

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
  mark: ProductMark
  children?: ReactNode
}) {
  return (
    <Card className="relative h-full hover:bg-muted/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <ProductMarkTile mark={mark} />
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription>{line}</CardDescription>
      </CardHeader>
      {children ? <CardContent className="mt-auto">{children}</CardContent> : null}
      <Link
        href={href}
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="sr-only">{title}</span>
      </Link>
    </Card>
  )
}

export function ConverterCard({ slug, locale }: { slug: ConverterSlug; locale: Locale }) {
  const converter = converterPageIn(slug, locale)
  return (
    <ToolCard
      title={converter.name}
      line={converter.card.line}
      href={localizedPath(converter.path, locale)}
      mark={{ glyph: converter.card.mark }}
    >
      <p className="flex flex-wrap items-center gap-1.5">
        <span lang={languageOf[converter.input]}>{converter.card.sample}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          →
        </span>
        <span className="sr-only">{getDictionary(locale).tools.card.becomes}</span>
        <span lang={languageOf[converter.output]}>
          {convert(converter.slug, converter.card.sample)}
        </span>
      </p>
    </ToolCard>
  )
}

export function CardGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {children}
    </ul>
  )
}
