import { ChevronRightIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { LearnerPrompt } from '@/components/dictionary/learner-prompt'
import { PageToolbar } from '@/components/dictionary/page-toolbar'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Section } from '@/components/dictionary/section'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent } from '@/components/ui/item'
import { getKanjiPage, isDictionaryAvailable } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { decodeSegment, kanjiPath } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/kanji/[character]'>

const readingKinds = { on: 'On', kun: 'Kun', name: 'Name' } as const

/** `/dictionary/kanji/<character>/`: the exact character, never Unicode-normalized. */
async function load(params: Props['params']) {
  if (!isDictionaryAvailable()) notFound()
  const kanji = await getKanjiPage(decodeSegment((await params).character))
  if (!kanji) notFound()
  return kanji
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const kanji = await load(params)
  const readings = kanji.readings.map(reading => reading.value).join(', ')
  return dictionaryMetadata(
    encodeURI(kanjiPath(kanji.character)),
    `${kanji.character} kanji meaning`,
    `${kanji.character}: ${kanji.meanings.join(', ')}. Readings ${readings}. ${kanji.strokeCount} strokes.`,
    { index: kanji.meanings.length > 0 || kanji.readings.length > 0 }
  )
}

export default async function KanjiPage({ params }: Props) {
  const kanji = await load(params)
  const stats = [
    { label: 'Strokes', value: kanji.strokeCount },
    { label: 'Grade', value: kanji.grade },
    { label: 'JLPT', value: kanji.jlpt ? `N${kanji.jlpt}` : null }
  ].filter(stat => stat.value !== null)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        page={{ label: `Kanji ${kanji.character}`, path: kanjiPath(kanji.character), lang: 'ja' }}
      />
      <PageToolbar
        title={kanji.character}
        shareText={`${kanji.character}: ${kanji.meanings.join(', ')}`}
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <span lang="ja" className="text-8xl leading-none">
              {kanji.character}
            </span>
            <dl className="flex flex-1 justify-around gap-4">
              {stats.map(stat => (
                <div key={stat.label} className="flex flex-col-reverse items-center">
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-lg font-medium">{kanji.meanings.join(', ')}</p>
        </CardContent>
      </Card>

      <Section title="Readings">
        <ul className="flex flex-col divide-y">
          {kanji.readings.map(reading => (
            <li
              key={`${reading.kind}${reading.value}`}
              className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
            >
              <span className="font-medium">{readingKinds[reading.kind]}</span>
              <span lang="ja" className="text-lg">
                {reading.value}
              </span>
              {reading.words.length > 0 ? (
                <ul className="col-start-2 flex flex-col text-muted-foreground">
                  {reading.words.map(word => (
                    <li key={`${word.headword}${word.summary}`}>
                      {word.path ? (
                        <Link
                          href={word.path}
                          lang="ja"
                          className="text-foreground underline-offset-4 hover:underline"
                        >
                          {word.headword}
                        </Link>
                      ) : (
                        <span lang="ja">{word.headword}</span>
                      )}{' '}
                      · {word.summary}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      {kanji.elements.length > 0 ? (
        <Section title="Elements">
          <ul className="flex flex-col gap-3">
            {kanji.elements.map(element => (
              <li key={element.character} className="flex items-center gap-4">
                <span
                  lang="ja"
                  className="grid size-14 shrink-0 place-items-center rounded-lg bg-muted text-3xl"
                >
                  {element.character}
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{element.role}</p>
                  <p>{element.meaning}</p>
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
            {kanji.words.map(word => (
              <Item key={word.entSeq} render={<Link href={word.path} />}>
                <RubyText segments={word.ruby} className="text-xl" />
                <ItemContent className="text-right text-muted-foreground">
                  {word.summary}
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </div>
        </Section>
      ) : null}

      <SourceCredits sources={pageSources.kanji} />
    </main>
  )
}
