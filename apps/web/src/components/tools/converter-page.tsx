import { SectionBreadcrumbs } from '@/components/section-breadcrumbs'
import { ConversionTable } from '@/components/tools/conversion-table'
import { Converter } from '@/components/tools/converter'
import { RichTextView } from '@/components/tools/rich-text'
import { CardGrid, ConverterCard } from '@/components/tools/tool-cards'
import { ToolQuestions } from '@/components/tools/tool-questions'
import { ToolReference } from '@/components/tools/tool-reference'
import { ToolSection, ToolsHeading, toolsPageClassName } from '@/components/tools/tool-section'
import { ToolsAppCard } from '@/components/tools/tools-app-card'
import { linkTo } from '@/lib/site'
import { howItWorks, plainText, questions } from '@/lib/tools/content'
import type { Converter as ConverterContent } from '@/lib/tools/converters'

export function ConverterPage({ converter }: { converter: ConverterContent }) {
  return (
    <main className={toolsPageClassName}>
      <div className="flex flex-col gap-4">
        <SectionBreadcrumbs
          section={{ title: 'Tools', ...linkTo('tools') }}
          page={converter.name}
        />
        <ToolsHeading title={converter.name} lead={converter.lead} />
      </div>
      <div className="flex flex-col gap-3">
        <Converter slug={converter.slug} />
        <p className="text-sm text-muted-foreground">
          It runs in your browser, so nothing you type is sent anywhere.
        </p>
      </div>
      <ToolSection title="How it works" className="max-w-2xl">
        {howItWorks[converter.slug].map(paragraph => (
          <p
            key={plainText(paragraph)}
            className="leading-relaxed text-pretty text-muted-foreground"
          >
            <RichTextView text={paragraph} />
          </p>
        ))}
      </ToolSection>
      <ToolReference converter={converter} />
      <ConversionTable slug={converter.slug} />
      <ToolQuestions questions={questions[converter.pair]} />
      <ToolSection title="Related tools">
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
    </main>
  )
}
