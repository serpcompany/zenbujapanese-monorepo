import { BrowseHeading, BrowsePage } from '@/components/dictionary/browse/browse-ui'
import { CardGrid, ConverterCard, ToolCard } from '@/components/tools/tool-cards'
import { ToolSection } from '@/components/tools/tool-section'
import { ToolsAppCard } from '@/components/tools/tools-app-card'
import { sitePageMetadata } from '@/lib/metadata'
import { converters, toolsIndex } from '@/lib/tools/converters'
import { referenceTools } from '@/lib/tools/reference-tools'

export const metadata = sitePageMetadata(toolsIndex)

export default function ToolsPage() {
  return (
    <BrowsePage>
      <BrowseHeading title="Online tools for learning Japanese">
        Convert between hiragana, katakana, and romaji, browse kana and kanji charts, and look up
        words. Free, in your browser, with nothing to install.
      </BrowseHeading>
      <ToolSection title="Converters">
        <CardGrid label="Converters">
          {converters.map(converter => (
            <li key={converter.slug}>
              <ConverterCard slug={converter.slug} />
            </li>
          ))}
        </CardGrid>
      </ToolSection>
      <ToolSection title="Dictionary and reference">
        <CardGrid label="Dictionary and reference">
          {referenceTools.map(tool => (
            <li key={tool.href}>
              <ToolCard title={tool.title} line={tool.line} href={tool.href} mark={tool.mark} />
            </li>
          ))}
        </CardGrid>
      </ToolSection>
      <ToolsAppCard
        title="Reading Japanese on paper or a screen?"
        line="The iPhone app reads it from a photo."
      />
    </BrowsePage>
  )
}
