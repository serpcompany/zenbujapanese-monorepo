import { ChevronRightIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { KanjiReadings } from '@/components/dictionary/kanji-readings'
import { LearnerPrompt } from '@/components/dictionary/learner-prompt'
import { PageToolbar } from '@/components/dictionary/page-toolbar'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Section } from '@/components/dictionary/section'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { StrokeOrder } from '@/components/dictionary/stroke-order'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent } from '@/components/ui/item'
import { getKanjiPage } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { decodeSegment, kanjiPath } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/kanji/[character]'>

/** `/dictionary/kanji/<character>/`: the exact character, never Unicode-normalized. */
async function load(params: Props['params']) {
  const kanji = await getKanjiPage(decodeSegment((await params).character))
  if (!kanji) notFound()
  return kanji
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const kanji = await load(params)
  const readings = kanji.readings.map(reading => reading.value).join(', ')
  const description = [
    kanji.meanings.length > 0
      ? `${kanji.character}: ${kanji.meanings.join(', ')}.`
      : kanji.character,
    readings ? `Readings ${readings}.` : '',
    kanji.stats.map(stat => `${stat.value} ${stat.label.toLowerCase()}.`)[0] ?? ''
  ]
  return dictionaryMetadata(
    encodeURI(kanjiPath(kanji.character)),
    `${kanji.character} kanji meaning`,
    description.filter(Boolean).join(' '),
    { index: kanji.indexable }
  )
}

/** A character, linking to its kanji page when it has one. */
function CharacterLink({ character, path }: { character: string; path: string | null }) {
  return path ? (
    <Link href={path} lang="ja" className="underline-offset-4 hover:underline">
      {character}
    </Link>
  ) : (
    <span lang="ja">{character}</span>
  )
}

export default async function KanjiPage({ params }: Props) {
  const kanji = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        page={{ label: `Kanji ${kanji.character}`, path: kanjiPath(kanji.character), lang: 'ja' }}
      />
      <PageToolbar title={kanji.character} shareText={kanji.shareText} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <span lang="ja" className="text-8xl leading-none">
                {kanji.character}
              </span>
              {/* KanjiDetailView's stroke-order button, under the glyph; none without a diagram. */}
              {kanji.strokeOrder ? (
                <StrokeOrder character={kanji.character} order={kanji.strokeOrder} />
              ) : null}
            </div>
            <dl className="flex flex-1 justify-around gap-4">
              {kanji.stats.map(stat => (
                <div key={stat.label} className="flex flex-col-reverse items-center">
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {kanji.meanings.length > 0 ? (
            <p className="text-lg font-medium">{kanji.meanings.join(', ')}</p>
          ) : null}
        </CardContent>
      </Card>

      {kanji.readings.length > 0 ? (
        <Section title="Readings">
          <KanjiReadings readings={kanji.readings} />
        </Section>
      ) : null}

      {kanji.components.length > 0 ? (
        <Section title="Components">
          <p className="text-xl">
            {kanji.components.map((component, index) => (
              <span key={component.character}>
                {index > 0 ? ' · ' : null}
                <CharacterLink {...component} />
              </span>
            ))}
          </p>
        </Section>
      ) : null}

      {kanji.elements.length > 0 ? (
        <Section title="Elements">
          <ul className="flex flex-col gap-3">
            {kanji.elements.map(element => (
              <li key={element.character} className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-muted text-3xl">
                  <CharacterLink character={element.character} path={element.path} />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{element.roleLabel}</p>
                  <p>{element.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Lists">
        <LearnerPrompt kind="lists" />
      </Section>
      <Section title="Notes">
        <LearnerPrompt kind="notes" />
      </Section>

      {kanji.words.length > 0 ? (
        <Section title="Words">
          <div className="-mx-3 flex flex-col">
            {kanji.words.map(word => {
              const content = (
                <>
                  <RubyText segments={word.ruby} className="text-xl" />
                  <ItemContent className="text-right text-muted-foreground">
                    {word.summary}
                  </ItemContent>
                  {word.path ? (
                    <ItemActions>
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </ItemActions>
                  ) : null}
                </>
              )
              // A word without a page yet (#465) shows without a link.
              return word.path ? (
                <Item key={word.entSeq} render={<Link href={word.path} />}>
                  {content}
                </Item>
              ) : (
                <Item key={word.entSeq}>{content}</Item>
              )
            })}
          </div>
        </Section>
      ) : null}

      <SourceCredits
        sources={kanji.strokeOrder ? pageSources.kanjiWithStrokes : pageSources.kanji}
      />
    </main>
  )
}
