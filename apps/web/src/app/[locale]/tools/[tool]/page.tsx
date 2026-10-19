import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ConverterPage } from '@/components/tools/converter-page'
import { localeOf } from '@/lib/i18n/params'
import { sitePageMetadata } from '@/lib/metadata'
import { converterSlugs, isConverterSlug } from '@/lib/tools/paths'
import { converterPageIn } from '@/lib/tools/tool-pages'

type Props = PageProps<'/[locale]/tools/[tool]'>

export function generateStaticParams() {
  return converterSlugs.map(tool => ({ tool }))
}

async function load(params: Props['params']) {
  const locale = await localeOf(params)
  const { tool } = await params
  if (!isConverterSlug(tool)) notFound()
  return { locale, converter: converterPageIn(tool, locale) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, converter } = await load(params)
  return sitePageMetadata(converter, locale)
}

export default async function ConverterRoute({ params }: Props) {
  const { locale, converter } = await load(params)
  return <ConverterPage converter={converter} locale={locale} />
}
