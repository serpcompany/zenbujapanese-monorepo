import { exampleCountText, noExamplesMessage } from '@zenbu/dictionary-core/detail/examples'
import type { Section as WordSection } from '@zenbu/dictionary-core/detail/sections'
import type { WordSectionKind } from '@zenbu/dictionary-core/detail/word'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { ConjugationsSection } from '@/components/dictionary/conjugations'
import { Disclosure } from '@/components/dictionary/disclosure'
import { ExampleList } from '@/components/dictionary/example-list'
import { FrequencySection } from '@/components/dictionary/frequency-section'
import { KanjiDetails } from '@/components/dictionary/kanji-details'
import { LearnerPrompt } from '@/components/dictionary/learner-prompt'
import { PageToolbar } from '@/components/dictionary/page-toolbar'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Section } from '@/components/dictionary/section'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { WordHeader } from '@/components/dictionary/word-header'
import {
  getWordPage,
  type WordPageData,
  type WordPageKanji,
  type WordPageWithKanji
} from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { wordExamplesAnchor } from '@/lib/dictionary/results/links'
import { pageSources, withShownData } from '@/lib/dictionary/sources'
import { decodeSegment, parseWordSegment } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/[word]'>

async function load(params: Props['params']) {
  const segment = (await params).word
  const parsed = parseWordSegment(segment)
  if (!parsed) notFound()
  const word = await getWordPage(parsed.entSeq)
  if (!word) notFound()
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

function KanjiItems({ kanji }: { kanji: WordPageKanji[] }) {
  return (
    <ul className="-mx-2 flex flex-col">
      {kanji.map(item => {
        const summary = (
          <>
            <span lang="ja" className="text-2xl font-semibold">
              {item.character}
            </span>
            <span className="text-muted-foreground">{item.meaning}</span>
          </>
        )
        return (
          <li key={item.character}>
            {item.details ? (
              <Disclosure
                data-kanji-row={item.character}
                label={`${item.character}, ${item.meaning}, shows kanji details`}
                buttonClassName="px-2 py-2"
                summary={summary}
              >
                <div className="px-2 pt-2 pb-4">
                  <KanjiDetails kanji={item.details} />
                </div>
              </Disclosure>
            ) : (
              <div className="flex items-center gap-3 px-2 py-2" data-kanji-row={item.character}>
                {summary}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function AlternativeForms({ forms }: { forms: WordPageData['alternatives'] }) {
  if (forms.length === 0) return null
  return (
    <p lang="ja" className="text-lg">
      {forms.map((form, index) => {
        const label = (
          <span className={form.labelText ? 'text-muted-foreground' : undefined}>
            {form.value}
            {form.labelText ? (
              <span lang="en" className="text-sm">
                {' '}
                {form.labelText}
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

function WordPageSection({
  section,
  word
}: {
  section: WordSection<WordSectionKind>
  word: WordPageWithKanji
}) {
  switch (section.kind) {
    case 'meaning':
      return (
        <Section title={section.title}>
          <ol className="flex flex-col gap-3">
            {word.senses.map(sense => (
              <li key={sense.number} className="flex gap-2">
                <span className="font-medium tabular-nums">{sense.number}.</span>
                <div>
                  <p className="font-medium">{sense.meaning}</p>
                  {sense.noteText ? (
                    <p className="text-muted-foreground">{sense.noteText}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )
    case 'frequency':
      return (
        <Section title={section.title}>
          <FrequencySection rows={word.frequencyRows} />
        </Section>
      )
    case 'conjugations':
      return word.conjugations ? (
        <ConjugationsSection title={section.title} conjugations={word.conjugations} />
      ) : null
    case 'alternatives':
      return (
        <Section title={section.title}>
          <div className="flex flex-col gap-2">
            <AlternativeForms forms={word.alternatives.filter(form => form.kind === 'written')} />
            <AlternativeForms forms={word.alternatives.filter(form => form.kind === 'reading')} />
          </div>
        </Section>
      )
    case 'kanji':
      return (
        <Section title={section.title}>
          <KanjiItems kanji={word.kanji} />
        </Section>
      )
    case 'alternativeKanji':
      return (
        <Section title={section.title}>
          <KanjiItems kanji={word.alternativeKanji} />
        </Section>
      )
    case 'related':
      return (
        <Section title={section.title}>
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
                <p className="text-sm text-muted-foreground">{related.description}</p>
              </li>
            ))}
          </ul>
        </Section>
      )
    case 'lists':
    case 'notes':
      return (
        <Section title={section.title}>
          <LearnerPrompt kind={section.kind} />
        </Section>
      )
    case 'examples':
      return (
        <Section title={section.title} id={wordExamplesAnchor}>
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
      )
  }
}

export default async function WordPage({ params }: Props) {
  const word = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-6">
      <PageToolbar
        page={{ label: word.headword, path: word.path, lang: 'ja' }}
        shareText={word.shareText}
      />

      <WordHeader
        headword={word.headword}
        ruby={word.ruby}
        reading={word.reading}
        pronounce={word.pronounce}
        pitch={word.pitch}
        partOfSpeechRow={word.partOfSpeechRow}
        conjugations={word.conjugations}
      />

      {word.sections.map(section => (
        <WordPageSection key={section.kind} section={section} word={word} />
      ))}

      <SourceCredits
        sources={withShownData(pageSources.word, {
          kanji: [...word.kanji, ...word.alternativeKanji].flatMap(item =>
            item.details ? [item.details] : []
          )
        })}
      />
    </main>
  )
}
