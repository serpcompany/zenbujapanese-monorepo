import type { ReactNode } from 'react'
import { BrowseHeading, BrowsePage } from '@/components/dictionary/browse/browse-ui'
import { SectionBreadcrumbs } from '@/components/section-breadcrumbs'
import { RichTextView } from '@/components/tools/rich-text'
import { CardGrid, ConverterCard } from '@/components/tools/tool-cards'
import { ToolQuestions } from '@/components/tools/tool-questions'
import { ArrowLink, ToolSection } from '@/components/tools/tool-section'
import { ToolsAppCard } from '@/components/tools/tools-app-card'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import type { Question } from '@/lib/questions'
import { linkTo } from '@/lib/site'
import { plainText, type RichText } from '@/lib/tools/content'
import type { ConverterSlug } from '@/lib/tools/paths'

export function ToolPage({
  name,
  lead,
  tool,
  howItWorks,
  questions,
  related,
  locale,
  children
}: {
  name: string
  lead: string
  tool: ReactNode
  howItWorks: readonly RichText[]
  questions: readonly Question[]
  related: readonly ConverterSlug[]
  locale: Locale
  children?: ReactNode
}) {
  const t = getDictionary(locale)
  const text = t.tools.page
  const allTools = { ...linkTo('tools'), href: localizedPath(linkTo('tools').href, locale) }
  return (
    <BrowsePage>
      <SectionBreadcrumbs
        section={{ title: text.section, ...allTools }}
        page={name}
        label={t.breadcrumbs.label}
      />
      <BrowseHeading title={name}>{lead}</BrowseHeading>
      {tool}
      <ToolSection title={text.howItWorks}>
        {howItWorks.map(paragraph => (
          <p key={plainText(paragraph)} className="max-w-3xl text-pretty text-muted-foreground">
            <RichTextView text={paragraph} />
          </p>
        ))}
      </ToolSection>
      {children}
      <ToolQuestions title={text.questions} questions={questions} />
      <ToolSection
        title={text.related}
        aside={
          <ArrowLink href={allTools.href} target={allTools.target}>
            {text.allTools}
          </ArrowLink>
        }
      >
        <CardGrid label={text.related}>
          {related.map(slug => (
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
