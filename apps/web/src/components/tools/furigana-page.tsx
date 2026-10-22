import { maximumQueryLength } from '@zenbu/dictionary-core/artifact/dictionary'
import { FuriganaConverter } from '@/components/tools/furigana-converter'
import { ToolPage } from '@/components/tools/tool-page'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import {
  type FuriganaPage as FuriganaContent,
  howItWorksIn,
  questionsIn
} from '@/lib/tools/tool-pages'

export function FuriganaPage({ page, locale }: { page: FuriganaContent; locale: Locale }) {
  const t = getDictionary(locale).tools
  return (
    <ToolPage
      name={page.name}
      lead={page.lead}
      howItWorks={howItWorksIn(page.slug, locale)}
      questions={questionsIn('furigana', locale)}
      related={page.related}
      locale={locale}
      tool={
        <FuriganaConverter
          sample={page.sample}
          tries={page.tries}
          limit={maximumQueryLength}
          text={t.furigana}
          words={t.converter}
          locale={locale}
        />
      }
    />
  )
}
