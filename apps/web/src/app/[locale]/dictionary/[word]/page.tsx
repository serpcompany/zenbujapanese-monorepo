import { exampleCountText, noExamplesMessage } from '@zenbu/dictionary-core/detail/examples'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import { glossSeparator, type Section as WordSection } from '@zenbu/dictionary-core/detail/sections'
import type { WordSectionKind } from '@zenbu/dictionary-core/detail/word'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { Fragment } from 'react'
import { ConjugationsSection } from '@/components/dictionary/conjugations'
import { Disclosure } from '@/components/dictionary/disclosure'
import { ExampleList, MeaningExample } from '@/components/dictionary/example-list'
import { FrequencySection } from '@/components/dictionary/frequency-section'
import { KanjiDetails } from '@/components/dictionary/kanji-details'
import { LearnerPrompt } from '@/components/dictionary/learner-prompt'
import { PageToolbar } from '@/components/dictionary/page-toolbar'
import { RomajiLine } from '@/components/dictionary/reading-aid-lines'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Section } from '@/components/dictionary/section'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { SourceText } from '@/components/dictionary/source-text'
import { WordHeader } from '@/components/dictionary/word-header'
import {
  getWordPage,
  type WordPageData,
  type WordPageKanji,
  type WordPageWithKanji
} from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { wordExamplesAnchor } from '@/lib/dictionary/results/links'
import {
  conjugationsIn,
  conjugationsText,
  exampleListText,
  frequencyRowsIn
} from '@/lib/dictionary/screen-text'
import { pageSources, withShownData } from '@/lib/dictionary/sources'
import { decodeSegment, parseWordSegment } from '@/lib/dictionary/urls'
import { wordDescription, wordTitle } from '@/lib/dictionary/word-snippet'
import { type Locale, sourceLang } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'

type Props = PageProps<'/[locale]/dictionary/[word]'>

async function load(params: Props['params']) {
  const locale = await localeOf(params)
  const segment = (await params).word
  const parsed = parseWordSegment(segment)
  if (!parsed) notFound()
  const word = await getWordPage(parsed.entSeq)
  if (!word) notFound()
  if (decodeSegment(segment) !== `${word.slug}-${word.entSeq}`) {
    permanentRedirect(encodeURI(localizedPath(word.path, locale)))
  }
  return { locale, word }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, word } = await load(params)
  return dictionaryMetadata(
    encodeURI(word.path),
    locale,
    wordTitle(word, locale),
    wordDescription(word, locale)
  )
}

function Notes({ notes, locale }: { notes: string[]; locale: Locale }) {
  return notes.map((note, index) => {
    const shown = coreText(note, locale)
    return (
      <Fragment key={note}>
        {index > 0 ? glossSeparator : null}
        {shown === note ? <SourceText text={note} locale={locale} /> : shown}
      </Fragment>
    )
  })
}

function KanjiItems({ kanji, locale }: { kanji: WordPageKanji[]; locale: Locale }) {
  const t = getDictionary(locale).word
  return (
    <ul className="-mx-2 flex flex-col">
      {kanji.map(item => {
        const summary = (
          <>
            <span lang="ja" className="text-2xl font-semibold">
              {item.character}
            </span>
            <span className="text-muted-foreground" lang={sourceLang(locale)}>
              {item.meaning}
            </span>
          </>
        )
        return (
          <li key={item.character}>
            {item.details ? (
              <Disclosure
                data-kanji-row={item.character}
                label={fill(t.kanjiRowLabel, {
                  character: item.character,
                  meaning: String(item.meaning)
                })}
                buttonClassName="px-2 py-2"
                summary={summary}
              >
                <div className="px-2 pt-2 pb-4">
                  <KanjiDetails kanji={item.details} locale={locale} />
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

function AlternativeForms({
  forms,
  locale
}: {
  forms: WordPageData['alternatives']
  locale: Locale
}) {
  if (forms.length === 0) return null
  const t = getDictionary(locale).word
  return (
    <p lang="ja" className="text-lg">
      {forms.map((form, index) => {
        const labels =
          form.labels.length > 0
            ? fill(t.formLabels, {
                labels: form.labels.map(label => coreText(label, locale)).join(t.labelSeparator)
              })
            : null
        const label = (
          <span className={labels ? 'text-muted-foreground' : undefined}>
            {form.value}
            {form.kind === 'reading' ? (
              <RomajiLine romaji={romaji(form.value)} className="ml-1 inline text-base" />
            ) : null}
            {labels ? (
              <span lang={locale === 'ja' ? undefined : locale} className="text-sm">
                {' '}
                {labels}
              </span>
            ) : null}
          </span>
        )
        return (
          <span key={form.value}>
            {index > 0 ? t.formSeparator : null}
            {form.path ? (
              <Link
                href={localizedPath(form.path, locale)}
                className="underline-offset-4 hover:underline"
              >
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
  word,
  locale
}: {
  section: WordSection<WordSectionKind>
  word: WordPageWithKanji
  locale: Locale
}) {
  const t = getDictionary(locale)
  const title = coreText(section.title, locale)
  switch (section.kind) {
    case 'meaning':
      return (
        <Section title={title}>
          <ol className="flex flex-col gap-3">
            {word.senses.map(sense => (
              <li key={sense.number} className="flex gap-2">
                <span className="font-medium tabular-nums">{sense.number}.</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium" lang={sourceLang(locale)}>
                    {sense.meaning}
                  </p>
                  {sense.noteText ? (
                    <p className="text-muted-foreground">
                      <Notes notes={sense.notes} locale={locale} />
                    </p>
                  ) : null}
                  {sense.example ? (
                    <MeaningExample
                      example={sense.example}
                      meaning={sense.number}
                      locale={locale}
                      text={exampleListText(locale)}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )
    case 'frequency':
      return (
        <Section title={title}>
          <FrequencySection rows={frequencyRowsIn(word.frequencyRows, locale)} text={t.frequency} />
        </Section>
      )
    case 'conjugations':
      return word.conjugations ? (
        <ConjugationsSection
          conjugations={conjugationsIn(word.conjugations, locale)}
          locale={locale}
          text={conjugationsText(locale)}
        />
      ) : null
    case 'alternatives':
      return (
        <Section title={title}>
          <div className="flex flex-col gap-2">
            <AlternativeForms
              forms={word.alternatives.filter(form => form.kind === 'written')}
              locale={locale}
            />
            <AlternativeForms
              forms={word.alternatives.filter(form => form.kind === 'reading')}
              locale={locale}
            />
          </div>
        </Section>
      )
    case 'kanji':
      return (
        <Section title={title}>
          <KanjiItems kanji={word.kanji} locale={locale} />
        </Section>
      )
    case 'alternativeKanji':
      return (
        <Section title={title}>
          <KanjiItems kanji={word.alternativeKanji} locale={locale} />
        </Section>
      )
    case 'related':
      return (
        <Section title={title}>
          <ul className="flex flex-col divide-y">
            {word.related.map(related => (
              <li
                key={`${related.headword}|${related.reading}|${related.entSeq}|${related.relation}`}
                className="py-2 first:pt-0 last:pb-0"
              >
                {related.path ? (
                  <Link
                    href={localizedPath(related.path, locale)}
                    className="underline-offset-4 hover:underline"
                  >
                    <RubyText segments={related.ruby} className="text-lg font-medium" />
                  </Link>
                ) : (
                  <RubyText segments={related.ruby} className="text-lg font-medium" />
                )}
                <RomajiLine romaji={romaji(related.reading)} className="text-sm" />
                <p className="text-sm text-muted-foreground">
                  {coreText(related.relation, locale)}
                  {glossSeparator}
                  <SourceText text={related.summary} locale={locale} />
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )
    case 'lists':
    case 'notes':
      return (
        <Section title={title}>
          <LearnerPrompt kind={section.kind} locale={locale} text={t.learner} />
        </Section>
      )
    case 'examples': {
      const count = exampleCountText(word.exampleCount)
      return (
        <Section title={title} id={wordExamplesAnchor}>
          {word.exampleCount && word.examples.length > 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {count === null ? null : coreText(count, locale)}
              </p>
              <ExampleList
                initial={word.examples}
                listed={word.exampleCount.listed}
                path={word.examplesPath}
                locale={locale}
                text={exampleListText(locale)}
              />
            </div>
          ) : (
            <p className="text-muted-foreground">{coreText(noExamplesMessage, locale)}</p>
          )}
        </Section>
      )
    }
  }
}

export default async function WordPage({ params }: Props) {
  const { locale, word } = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-6" data-reading-aids>
      <PageToolbar
        page={{ label: word.headword, path: word.path, lang: 'ja' }}
        shareText={word.shareText}
        locale={locale}
      />

      <WordHeader
        headword={word.headword}
        ruby={word.ruby}
        reading={word.reading}
        pronounce={word.pronounce}
        pitch={word.pitch}
        partOfSpeechRow={word.partOfSpeechRow}
        conjugations={word.conjugations}
        locale={locale}
      />

      {word.sections.map(section => (
        <WordPageSection key={section.kind} section={section} word={word} locale={locale} />
      ))}

      <SourceCredits
        locale={locale}
        sources={withShownData(pageSources.word, {
          kanji: [...word.kanji, ...word.alternativeKanji].flatMap(item =>
            item.details ? [item.details] : []
          )
        })}
      />
    </main>
  )
}
