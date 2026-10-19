import { BrowseHeading, BrowsePage } from '@/components/dictionary/browse/browse-ui'
import { CardGrid, ConverterCard, ToolCard } from '@/components/tools/tool-cards'
import { ToolSection } from '@/components/tools/tool-section'
import { ToolsAppCard } from '@/components/tools/tools-app-card'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'
import { sitePageMetadata } from '@/lib/metadata'
import { converters } from '@/lib/tools/converters'
import { referenceToolsIn } from '@/lib/tools/reference-tools'
import { toolsIndexIn } from '@/lib/tools/tool-pages'

export async function generateMetadata({ params }: PageProps<'/[locale]/tools'>) {
  const locale = await localeOf(params)
  return sitePageMetadata(toolsIndexIn(locale), locale)
}

export default async function ToolsPage({ params }: PageProps<'/[locale]/tools'>) {
  const locale = await localeOf(params)
  const text = getDictionary(locale).tools.index
  return (
    <BrowsePage>
      <BrowseHeading title={text.title}>{text.lead}</BrowseHeading>
      <ToolSection title={text.converters}>
        <CardGrid label={text.converters}>
          {converters.map(converter => (
            <li key={converter.slug}>
              <ConverterCard slug={converter.slug} locale={locale} />
            </li>
          ))}
        </CardGrid>
      </ToolSection>
      <ToolSection title={text.reference}>
        <CardGrid label={text.reference}>
          {referenceToolsIn(locale).map(tool => (
            <li key={tool.href}>
              <ToolCard
                title={tool.title}
                line={tool.line}
                href={localizedPath(tool.href, locale)}
                mark={tool.mark}
              />
            </li>
          ))}
        </CardGrid>
      </ToolSection>
      <ToolsAppCard title={text.appTitle} line={text.appLine} locale={locale} />
    </BrowsePage>
  )
}
