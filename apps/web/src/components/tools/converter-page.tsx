import { ConversionChart } from '@/components/tools/conversion-chart'
import { Converter } from '@/components/tools/converter'
import { ToolPage } from '@/components/tools/tool-page'
import { ToolReference } from '@/components/tools/tool-reference'
import { ArrowLink } from '@/components/tools/tool-section'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import {
  type ConverterPage as ConverterContent,
  converterPageIn,
  howItWorksIn,
  questionsIn
} from '@/lib/tools/tool-pages'

export function ConverterPage({
  converter,
  locale
}: {
  converter: ConverterContent
  locale: Locale
}) {
  const counterpart = converterPageIn(converter.reverse, locale)
  return (
    <ToolPage
      name={converter.name}
      lead={converter.lead}
      howItWorks={howItWorksIn(converter.slug, locale)}
      questions={questionsIn(converter.pair, locale)}
      related={converter.related}
      locale={locale}
      tool={
        <div className="flex flex-col gap-3">
          <Converter
            slug={converter.slug}
            from={converter.from}
            to={converter.to}
            text={getDictionary(locale).tools.converter}
            locale={locale}
          />
          <div className="flex justify-end">
            <ArrowLink href={localizedPath(counterpart.path, locale)}>{counterpart.name}</ArrowLink>
          </div>
        </div>
      }
    >
      <ToolReference converter={converter} locale={locale} />
      <ConversionChart slug={converter.slug} locale={locale} />
    </ToolPage>
  )
}
