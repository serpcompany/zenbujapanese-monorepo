import { BrowseHeading, BrowsePage } from '@/components/dictionary/browse/browse-ui'
import { SectionBreadcrumbs } from '@/components/section-breadcrumbs'
import { ConversionChart } from '@/components/tools/conversion-chart'
import { Converter } from '@/components/tools/converter'
import { RichTextView } from '@/components/tools/rich-text'
import { CardGrid, ConverterCard } from '@/components/tools/tool-cards'
import { ToolQuestions } from '@/components/tools/tool-questions'
import { ToolReference } from '@/components/tools/tool-reference'
import { ArrowLink, ToolSection } from '@/components/tools/tool-section'
import { ToolsAppCard } from '@/components/tools/tools-app-card'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { linkTo } from '@/lib/site'
import { plainText } from '@/lib/tools/content'
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
  const t = getDictionary(locale)
  const text = t.tools.page
  const counterpart = converterPageIn(converter.reverse, locale)
  const allTools = { ...linkTo('tools'), href: localizedPath(linkTo('tools').href, locale) }
  return (
    <BrowsePage>
      <SectionBreadcrumbs
        section={{ title: text.section, ...allTools }}
        page={converter.name}
        label={t.breadcrumbs.label}
      />
      <BrowseHeading title={converter.name}>{converter.lead}</BrowseHeading>
      <div className="flex flex-col gap-3">
        <Converter
          slug={converter.slug}
          from={converter.from}
          to={converter.to}
          text={t.tools.converter}
          locale={locale}
        />
        <div className="flex justify-end">
          <ArrowLink href={localizedPath(counterpart.path, locale)}>{counterpart.name}</ArrowLink>
        </div>
      </div>
      <ToolSection title={text.howItWorks}>
        {howItWorksIn(converter.slug, locale).map(paragraph => (
          <p key={plainText(paragraph)} className="max-w-3xl text-pretty text-muted-foreground">
            <RichTextView text={paragraph} />
          </p>
        ))}
      </ToolSection>
      <ToolReference converter={converter} locale={locale} />
      <ConversionChart slug={converter.slug} locale={locale} />
      <ToolQuestions title={text.questions} questions={questionsIn(converter.pair, locale)} />
      <ToolSection
        title={text.related}
        aside={
          <ArrowLink href={allTools.href} target={allTools.target}>
            {text.allTools}
          </ArrowLink>
        }
      >
        <CardGrid label={text.related}>
          {converter.related.map(slug => (
            <li key={slug}>
              <ConverterCard slug={slug} locale={locale} />
            </li>
          ))}
        </CardGrid>
      </ToolSection>
      <ToolsAppCard title={text.appTitle} line={text.appLine} locale={locale} withDictionary />
    </BrowsePage>
  )
}
