import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import { glossSeparator, type Section as WordSection } from '@zenbu/dictionary-core/detail/sections'
import { fill } from '@zenbu/dictionary-core/detail/text'
import type {
  AlternativeForm,
  RelatedWord,
  WordSectionKind
} from '@zenbu/dictionary-core/detail/word'
import { Fragment, type ReactNode } from 'react'
import { Disclosure } from './disclosure'
import { FrequencySection, type FrequencyText, type ShownFrequencyRow } from './frequency-section'
import { KanjiDetails, type KanjiDetailsProps, type ShownKanjiDetails } from './kanji-details'
import { RomajiLine } from './reading-aid-lines'
import { RubyText } from './ruby-text'
import { Section } from './section'
import { SourceText } from './source-text'
import type { RenderWordLink } from './word-link'

export interface ShownNote {
  text: string
  source: boolean
}

export interface ShownSense<E> {
  number: number
  meaning: string
  notes: ShownNote[]
  example: E | null
}

export interface ShownAlternativeForm extends Omit<AlternativeForm, 'labels' | 'labelText'> {
  labels: string | null
}

export interface ShownWordKanji {
  character: string
  meaning: string | null
  details: ShownKanjiDetails | null
}

export interface ShownWordSections<E> {
  sections: WordSection<WordSectionKind>[]
  senses: ShownSense<E>[]
  frequencyRows: ShownFrequencyRow[]
  alternatives: ShownAlternativeForm[]
  kanji: ShownWordKanji[]
  alternativeKanji: ShownWordKanji[]
  related: RelatedWord[]
  examples: { count: string | null } | { empty: string }
}

export interface WordSectionsText {
  lang: string
  word: { kanjiRowLabel: string; formSeparator: string }
  frequency: FrequencyText
  chrome: { close: string }
}

export interface WordSectionsProps<E> extends Pick<KanjiDetailsProps, 'learnerPrompt'> {
  word: ShownWordSections<E>
  lang?: string
  text: WordSectionsText
  renderWordLink: RenderWordLink
  renderMeaningExample: (example: E, meaning: number) => ReactNode
  kanjiActions: (kanji: ShownKanjiDetails) => ReactNode
  conjugations: ReactNode
  examples: ReactNode
  examplesAnchor: string
}

type Shared<E> = Omit<WordSectionsProps<E>, 'word'>

function Notes({ notes, lang }: { notes: ShownNote[]; lang?: string }) {
  return notes.map((note, index) => (
    <Fragment key={note.text}>
      {index > 0 ? glossSeparator : null}
      {note.source ? <SourceText text={note.text} lang={lang} /> : note.text}
    </Fragment>
  ))
}

function KanjiItems<E>({ kanji, ...props }: Shared<E> & { kanji: ShownWordKanji[] }) {
  return (
    <ul className="-mx-2 flex flex-col">
      {kanji.map(item => {
        const summary = (
          <>
            <span lang="ja" className="text-2xl font-semibold">
              {item.character}
            </span>
            <span className="text-muted-foreground" lang={props.lang}>
              {item.meaning}
            </span>
          </>
        )
        return (
          <li key={item.character}>
            {item.details ? (
              <Disclosure
                data-kanji-row={item.character}
                label={fill(props.text.word.kanjiRowLabel, {
                  character: item.character,
                  meaning: String(item.meaning)
                })}
                buttonClassName="px-2 py-2"
                summary={summary}
              >
                <div className="px-2 pt-2 pb-4">
                  <KanjiDetails
                    kanji={item.details}
                    lang={props.lang}
                    text={props.text.chrome}
                    renderWordLink={props.renderWordLink}
                    actions={props.kanjiActions(item.details)}
                    learnerPrompt={props.learnerPrompt}
                  />
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

function AlternativeForms<E>({ forms, ...props }: Shared<E> & { forms: ShownAlternativeForm[] }) {
  if (forms.length === 0) return null
  const { lang, word } = props.text
  return (
    <p lang="ja" className="text-lg">
      {forms.map((form, index) => {
        const label = (
          <span className={form.labels ? 'text-muted-foreground' : undefined}>
            {form.value}
            {form.kind === 'reading' ? (
              <RomajiLine romaji={romaji(form.value)} className="ml-1 inline text-base" />
            ) : null}
            {form.labels ? (
              <span lang={lang === 'ja' ? undefined : lang} className="text-sm">
                {' '}
                {form.labels}
              </span>
            ) : null}
          </span>
        )
        const link = form.kanji
          ? props.renderWordLink({
              target: { kanji: form.kanji },
              className: 'underline-offset-4 hover:underline',
              children: label
            })
          : null
        return (
          <span key={form.value}>
            {index > 0 ? word.formSeparator : null}
            {link ?? label}
          </span>
        )
      })}
    </p>
  )
}

function RelatedWords<E>({ related, ...props }: Shared<E> & { related: RelatedWord[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {related.map(word => {
        const ruby = <RubyText segments={word.ruby} className="text-lg font-medium" />
        const link =
          word.entSeq === null
            ? null
            : props.renderWordLink({
                target: { entSeq: word.entSeq },
                className: 'underline-offset-4 hover:underline',
                children: ruby
              })
        return (
          <li
            key={`${word.headword}|${word.reading}|${word.entSeq}|${word.relation}`}
            className="py-2 first:pt-0 last:pb-0"
          >
            {link ?? ruby}
            <RomajiLine romaji={romaji(word.reading)} className="text-sm" />
            <p className="text-sm text-muted-foreground">
              {word.relation}
              {glossSeparator}
              <SourceText text={word.summary} lang={props.lang} />
            </p>
          </li>
        )
      })}
    </ul>
  )
}

function WordSectionContent<E>({
  section,
  word,
  ...props
}: WordSectionsProps<E> & { section: WordSection<WordSectionKind> }) {
  const { title } = section
  switch (section.kind) {
    case 'meaning':
      return (
        <Section title={title}>
          <ol className="flex flex-col gap-3">
            {word.senses.map(sense => (
              <li key={sense.number} className="flex gap-2">
                <span className="font-medium tabular-nums">{sense.number}.</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium" lang={props.lang}>
                    {sense.meaning}
                  </p>
                  {sense.notes.length > 0 ? (
                    <p className="text-muted-foreground">
                      <Notes notes={sense.notes} lang={props.lang} />
                    </p>
                  ) : null}
                  {sense.example ? props.renderMeaningExample(sense.example, sense.number) : null}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )
    case 'frequency':
      return (
        <Section title={title}>
          <FrequencySection rows={word.frequencyRows} text={props.text.frequency} />
        </Section>
      )
    case 'conjugations':
      return props.conjugations
    case 'alternatives':
      return (
        <Section title={title}>
          <div className="flex flex-col gap-2">
            <AlternativeForms
              forms={word.alternatives.filter(form => form.kind === 'written')}
              {...props}
            />
            <AlternativeForms
              forms={word.alternatives.filter(form => form.kind === 'reading')}
              {...props}
            />
          </div>
        </Section>
      )
    case 'kanji':
      return (
        <Section title={title}>
          <KanjiItems kanji={word.kanji} {...props} />
        </Section>
      )
    case 'alternativeKanji':
      return (
        <Section title={title}>
          <KanjiItems kanji={word.alternativeKanji} {...props} />
        </Section>
      )
    case 'related':
      return (
        <Section title={title}>
          <RelatedWords related={word.related} {...props} />
        </Section>
      )
    case 'lists':
    case 'notes':
      return <Section title={title}>{props.learnerPrompt(section.kind)}</Section>
    case 'examples':
      return (
        <Section title={title} id={props.examplesAnchor}>
          {'count' in word.examples ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{word.examples.count}</p>
              {props.examples}
            </div>
          ) : (
            <p className="text-muted-foreground">{word.examples.empty}</p>
          )}
        </Section>
      )
  }
}

export function WordSections<E>(props: WordSectionsProps<E>) {
  return props.word.sections.map(section => (
    <WordSectionContent key={section.kind} section={section} {...props} />
  ))
}
