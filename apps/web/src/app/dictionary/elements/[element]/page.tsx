import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { KanjiElementContent } from '@/components/dictionary/kanji-element'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { getKanjiElementPage } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { decodeSegment, kanjiElementPath } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/elements/[element]'>

/** `/dictionary/elements/<element>/`: the exact glyph, never Unicode-normalized. */
async function load(params: Props['params']) {
  const element = await getKanjiElementPage(decodeSegment((await params).element))
  if (!element) notFound()
  return element
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const element = await load(params)
  const kanji = element.containingKanji.slice(0, 5).map(row => row.character)
  const description = [
    element.meanings ? `${element.glyph}: ${element.meanings}.` : element.glyph,
    element.soundPatterns ? `${element.soundPatterns}.` : '',
    kanji.length > 0
      ? `Part of ${element.containingKanji.length} kanji, such as ${kanji.join('、')}.`
      : ''
  ]
  return dictionaryMetadata(
    encodeURI(kanjiElementPath(element.glyph)),
    `${element.glyph} kanji element meaning`,
    description.filter(Boolean).join(' '),
    { index: element.indexable }
  )
}

export default async function KanjiElementPage({ params }: Props) {
  const element = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        page={{
          label: `Element ${element.glyph}`,
          path: kanjiElementPath(element.glyph),
          lang: 'ja'
        }}
      />
      <KanjiElementContent element={element} />
      <SourceCredits sources={pageSources.element} />
    </main>
  )
}
