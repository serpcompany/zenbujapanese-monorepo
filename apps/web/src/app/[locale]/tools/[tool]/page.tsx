import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ConverterPage } from '@/components/tools/converter-page'
import { FuriganaPage } from '@/components/tools/furigana-page'
import { localeOf } from '@/lib/i18n/params'
import { sitePageMetadata } from '@/lib/metadata'
import { furiganaSlug, isConverterSlug, toolSlugs } from '@/lib/tools/paths'
import { converterPageIn, furiganaPageIn } from '@/lib/tools/tool-pages'

type Props = PageProps<'/[locale]/tools/[tool]'>

export function generateStaticParams() {
  return toolSlugs.map(tool => ({ tool }))
}

async function load(params: Props['params']) {
  const locale = await localeOf(params)
  const { tool } = await params
  if (tool === furiganaSlug) {
    const page = furiganaPageIn(locale)
    return { locale, page, view: <FuriganaPage page={page} locale={locale} /> }
  }
  if (!isConverterSlug(tool)) notFound()
  const page = converterPageIn(tool, locale)
  return { locale, page, view: <ConverterPage converter={page} locale={locale} /> }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await load(params)
  return sitePageMetadata(page, locale)
}

export default async function ToolRoute({ params }: Props) {
  return (await load(params)).view
}
