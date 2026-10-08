import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ConverterPage } from '@/components/tools/converter-page'
import { sitePageMetadata } from '@/lib/metadata'
import { converterFor } from '@/lib/tools/converters'
import { converterSlugs, isConverterSlug } from '@/lib/tools/paths'

type Props = PageProps<'/tools/[tool]'>

export function generateStaticParams() {
  return converterSlugs.map(tool => ({ tool }))
}

async function load(params: Props['params']) {
  const { tool } = await params
  if (!isConverterSlug(tool)) notFound()
  return converterFor(tool)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sitePageMetadata(await load(params))
}

export default async function ConverterRoute({ params }: Props) {
  return <ConverterPage converter={await load(params)} />
}
