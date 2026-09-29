import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { ConjugatedFormContent, ConjugatedFormExamples } from '@/components/dictionary/conjugations'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { Section } from '@/components/dictionary/section'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { Card, CardContent } from '@/components/ui/card'
import { getConjugatedFormPage } from '@/lib/dictionary/data'
import { conjugationModes, isConjugationKind } from '@/lib/dictionary/detail/conjugation'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { conjugationsHref, decodeSegment, parseWordSegment } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/[word]/conjugations/[register]/[kind]'>

/**
 * `/dictionary/<slug>-<ent_seq>/conjugations/<plain|polite>/<kind>/`: one conjugated form's
 * screen (ConjugatedFormView), which the app pushes from the table. A register or kind the word's
 * table lacks isn't found; any other slug redirects.
 */
async function load(params: Props['params']) {
  const { word: segment, register, kind } = await params
  const parsed = parseWordSegment(segment)
  const mode = Object.hasOwn(conjugationModes, register) ? conjugationModes[register] : undefined
  if (!parsed || !mode || !isConjugationKind(kind)) notFound()
  const page = await getConjugatedFormPage(parsed.entSeq, mode, kind)
  if (!page) notFound()
  if (decodeSegment(segment) !== `${page.slug}-${page.entSeq}`) {
    permanentRedirect(encodeURI(page.formPath))
  }
  return page
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load(params)
  const { row } = page
  const reading = row.reading === row.surface ? '' : ` (${row.reading})`
  const register = page.mode === 'Polite' ? 'polite ' : ''
  return dictionaryMetadata(
    encodeURI(page.canonicalPath),
    `${row.surface}${reading}: ${register}${row.title.toLowerCase()} of ${page.headword}`,
    `${row.surface}${reading} is the ${register}${row.title.toLowerCase()} form of ${page.headword}. ${row.explanation}`,
    // A screen without examples is only the form and what it means.
    { index: page.listed > 0 }
  )
}

export default async function ConjugatedFormPage({ params }: Props) {
  const page = await load(params)
  const { row } = page
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        pages={[
          { label: page.headword, path: page.path, lang: 'ja' },
          {
            label: 'Conjugations',
            path: page.conjugationsPath,
            href: conjugationsHref(page.conjugationsPath, page.mode)
          },
          {
            label: page.mode === 'Polite' ? `${row.title} (Polite)` : row.title,
            path: page.formPath
          }
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">{row.title}</h1>
      <Card>
        <CardContent>
          <ConjugatedFormContent row={row} />
        </CardContent>
      </Card>
      <Section title="Examples">
        <ConjugatedFormExamples
          examples={page.examples}
          listed={page.listed}
          path={page.examplesPath}
        />
      </Section>
      <SourceCredits sources={pageSources.conjugatedForm} />
    </main>
  )
}
