import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import { BrowseHeading, BrowsePage } from '@/components/dictionary/browse/browse-ui'
import { SectionBreadcrumbs } from '@/components/section-breadcrumbs'
import { ConversionTable } from '@/components/tools/conversion-table'
import { Converter } from '@/components/tools/converter'
import { RichTextView } from '@/components/tools/rich-text'
import { CardGrid, ConverterCard } from '@/components/tools/tool-cards'
import { ToolQuestions } from '@/components/tools/tool-questions'
import { ToolReference } from '@/components/tools/tool-reference'
import { ToolSection } from '@/components/tools/tool-section'
import { ToolsAppCard } from '@/components/tools/tools-app-card'
import { linkTo } from '@/lib/site'
import { howItWorks, plainText, questions } from '@/lib/tools/content'
import { type Converter as ConverterContent, converterFor } from '@/lib/tools/converters'

export function ConverterPage({ converter }: { converter: ConverterContent }) {
  const counterpart = converterFor(converter.reverse)
  return (
    <BrowsePage>
      <SectionBreadcrumbs section={{ title: 'Tools', ...linkTo('tools') }} page={converter.name} />
      <BrowseHeading title={converter.name}>{converter.lead}</BrowseHeading>
      <div className="flex flex-col gap-3">
        <Converter slug={converter.slug} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <p className="text-muted-foreground">
            It runs in your browser, so nothing you type is sent anywhere.
          </p>
          <Link
            href={counterpart.path}
            className="inline-flex items-center gap-1 font-medium hover:underline"
          >
            {counterpart.name}
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
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
    </BrowsePage>
  )
}
