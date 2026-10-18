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
import { linkTo } from '@/lib/site'
import { howItWorks, plainText, questions } from '@/lib/tools/content'
import { type Converter as ConverterContent, converterFor } from '@/lib/tools/converters'

export function ConverterPage({ converter }: { converter: ConverterContent }) {
  const counterpart = converterFor(converter.reverse)
  const allTools = linkTo('tools')
  return (
    <BrowsePage>
      <SectionBreadcrumbs section={{ title: 'Tools', ...allTools }} page={converter.name} />
      <BrowseHeading title={converter.name}>{converter.lead}</BrowseHeading>
      <div className="flex flex-col gap-3">
        <Converter slug={converter.slug} />
        <div className="flex justify-end">
          <ArrowLink href={counterpart.path}>{counterpart.name}</ArrowLink>
        </div>
      </div>
      <ToolSection title="How it works">
        {howItWorks[converter.slug].map(paragraph => (
          <p key={plainText(paragraph)} className="max-w-3xl text-pretty text-muted-foreground">
            <RichTextView text={paragraph} />
          </p>
        ))}
      </ToolSection>
      <ToolReference converter={converter} />
      <ConversionChart slug={converter.slug} />
      <ToolQuestions questions={questions[converter.pair]} />
      <ToolSection
        title="Related tools"
        aside={
          <ArrowLink href={allTools.href} target={allTools.target}>
            All tools
          </ArrowLink>
        }
      >
        <CardGrid label="Related tools">
          {converter.related.map(slug => (
            <li key={slug}>
              <ConverterCard slug={slug} />
            </li>
          ))}
        </CardGrid>
      </ToolSection>
      <ToolsAppCard
        title="Found a word you don’t know?"
        line="Search it in the dictionary, or read it from a photo with the app."
        withDictionary
      />
    </BrowsePage>
  )
}
