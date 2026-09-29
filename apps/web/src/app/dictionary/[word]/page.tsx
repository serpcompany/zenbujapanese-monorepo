import { exampleCountText, noExamplesMessage } from '@zenbu/dictionary-core/detail/examples'
import { ChevronRightIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { ExampleList } from '@/components/dictionary/example-list'
import { FrequencySection } from '@/components/dictionary/frequency-section'
import { LearnerPrompt } from '@/components/dictionary/learner-prompt'
import { PageToolbar } from '@/components/dictionary/page-toolbar'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Section } from '@/components/dictionary/section'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { WordHeader } from '@/components/dictionary/word-header'
import { Item, ItemActions, ItemContent } from '@/components/ui/item'
import { getWordPage, type WordPageData } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { decodeSegment, parseWordSegment } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/[word]'>

/** `/dictionary/<slug>-<ent_seq>/`: the number decides the word; any other slug redirects. */
async function load(params: Props['params']) {
  const segment = (await params).word
  const parsed = parseWordSegment(segment)
  if (!parsed) notFound()
  const word = await getWordPage(parsed.entSeq)
  if (!word) notFound()
  // Any other slug, a bare number, or a padded one (要る-01546640) redirects, so each word has
  // one URL. Location headers are ASCII, so the Japanese slug is percent-encoded.
  if (decodeSegment(segment) !== `${word.slug}-${word.entSeq}`) {
    permanentRedirect(encodeURI(word.path))
  }
  return word
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const word = await load(params)
  const reading = word.reading === word.headword ? '' : ` (${word.reading})`
  const partOfSpeech = word.partOfSpeech ? ` ${word.partOfSpeech}.` : ''
  return dictionaryMetadata(
    encodeURI(word.path),
    `${word.headword}${reading} meaning`,
    `${word.headword}${reading}: ${word.summary}.${partOfSpeech}`
  )
}

/** Kanji rows, each linking to its kanji page when it has one. */
function KanjiItems({ kanji }: { kanji: WordPageData['kanji'] }) {
  return (
    <div className="-mx-3 flex flex-col">
      {kanji.map(item => {
        const content = (
          <>
            <span lang="ja" className="text-2xl font-semibold">
              {item.character}
            </span>
            <ItemContent className="text-muted-foreground">{item.meaning}</ItemContent>
            {item.path ? (
              <ItemActions>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </ItemActions>
            ) : null}
          </>
        )
        return item.path ? (
          <Item key={item.character} render={<Link href={item.path} />}>
            {content}
          </Item>
        ) : (
          <Item key={item.character}>{content}</Item>
        )
      })}
    </div>
  )
}

/** One line of alternative forms, written or reading, as the app's AlternativeFormLine. */
function AlternativeForms({ forms }: { forms: WordPageData['alternatives'] }) {
  if (forms.length === 0) return null
  return (
    <p lang="ja" className="text-lg">
      {forms.map((form, index) => {
        const label = (
          <span className={form.labels.length > 0 ? 'text-muted-foreground' : undefined}>
            {form.value}
            {form.labels.length > 0 ? (
              <span lang="en" className="text-sm">
                {' '}
                ({form.labels.join(', ')})
              </span>
            ) : null}
          </span>
        )
        return (
          <span key={form.value}>
            {index > 0 ? ', ' : null}
            {form.path ? (
              <Link href={form.path} className="underline-offset-4 hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
          </span>
        )
      })}
    </p>
  )
}

export default async function WordPage({ params }: Props) {
  const word = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs page={{ label: word.headword, path: word.path, lang: 'ja' }} />
      <PageToolbar title={word.headword} shareText={word.shareText} />

      <WordHeader
        ruby={word.ruby}
        reading={word.reading}
        pitch={word.pitch}
        partOfSpeech={word.partOfSpeech}
        summary={word.summary}
        conjugations={word.conjugations}
      />

      <Section title="Meaning">
        <ol className="flex flex-col gap-3">
          {word.senses.map(sense => (
            <li key={sense.number} className="flex gap-2">
              <span className="font-medium tabular-nums">{sense.number}.</span>
              <div>
                <p className="font-medium">{sense.meaning}</p>
                {sense.notes.length > 0 ? (
                  <p className="text-muted-foreground">{sense.notes.join(' · ')}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Frequency">
        <FrequencySection rows={word.frequencyRows} />
      </Section>

      {word.alternatives.length > 0 ? (
        <Section title="Alternatives">
          <div className="flex flex-col gap-2">
            <AlternativeForms forms={word.alternatives.filter(form => form.kind === 'written')} />
            <AlternativeForms forms={word.alternatives.filter(form => form.kind === 'reading')} />
          </div>
        </Section>
      ) : null}

      {word.kanji.length > 0 ? (
        <Section title="Kanji">
          <KanjiItems kanji={word.kanji} />
        </Section>
      ) : null}

      {word.alternativeKanji.length > 0 ? (
        <Section title="Alternative kanji">
          <KanjiItems kanji={word.alternativeKanji} />
        </Section>
      ) : null}

      {word.related.length > 0 ? (
        <Section title="Related words">
          <ul className="flex flex-col divide-y">
            {word.related.map(related => (
              <li
                key={`${related.headword}|${related.reading}|${related.entSeq}|${related.relation}`}
                className="py-2 first:pt-0 last:pb-0"
              >
                {related.path ? (
                  <Link href={related.path} className="underline-offset-4 hover:underline">
                    <RubyText segments={related.ruby} className="text-lg font-medium" />
                  </Link>
                ) : (
                  <RubyText segments={related.ruby} className="text-lg font-medium" />
                )}
                <p className="text-sm text-muted-foreground">
                  {related.relation} · {related.summary}
                </p>
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

      <Section title="Examples">
        {word.exampleCount && word.examples.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{exampleCountText(word.exampleCount)}</p>
            <ExampleList
              initial={word.examples}
              listed={word.exampleCount.listed}
              path={word.examplesPath}
            />
          </div>
        ) : (
          <p className="text-muted-foreground">{noExamplesMessage}</p>
        )}
      </Section>

      <SourceCredits sources={pageSources.word} />
    </main>
  )
}
