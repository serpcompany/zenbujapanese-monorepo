import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { ConjugationTable } from '@/components/dictionary/conjugations'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { Card, CardContent } from '@/components/ui/card'
import { getConjugationsPage } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { decodeSegment, parseWordSegment } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/[word]/conjugations'>

/**
 * `/dictionary/<slug>-<ent_seq>/conjugations/`: the table the word's part of speech opens
 * (ConjugationsView), which the app pushes as its own screen. A word whose part of speech opens
 * none has no such page; any other slug redirects, as the word's page does.
 */
async function load(params: Props['params']) {
  const segment = (await params).word
  const parsed = parseWordSegment(segment)
  if (!parsed) notFound()
  const page = await getConjugationsPage(parsed.entSeq)
  if (!page) notFound()
  if (decodeSegment(segment) !== `${page.slug}-${page.entSeq}`) {
    permanentRedirect(encodeURI(page.conjugationsPath))
  }
  return page
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load(params)
  const reading = page.reading === page.headword ? '' : ` (${page.reading})`
  const forms = page.conjugations.rows.Plain.map(row => row.surface).join(', ')
  return dictionaryMetadata(
    encodeURI(page.conjugationsPath),
    `${page.headword}${reading} conjugation`,
    `${page.headword}${reading} conjugations${page.partOfSpeech ? `, ${page.partOfSpeech}` : ''}: ${forms}.`
  )
}

export default async function ConjugationsPage({ params }: Props) {
  const page = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        pages={[
          { label: page.headword, path: page.path, lang: 'ja' },
          { label: 'Conjugations', path: page.conjugationsPath }
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">Conjugations</h1>
      <Card>
        <CardContent>
          <ConjugationTable
            word={{
              ruby: page.ruby,
              reading: page.reading,
              romaji: page.romaji,
              readingWithoutFurigana: page.readingWithoutFurigana,
              summary: page.summary,
              partOfSpeech: page.partOfSpeech,
              pitch: page.pitch
            }}
            conjugations={page.conjugations}
            wordPath={page.path}
          />
        </CardContent>
      </Card>
      <SourceCredits sources={pageSources.conjugations} />
    </main>
  )
}
