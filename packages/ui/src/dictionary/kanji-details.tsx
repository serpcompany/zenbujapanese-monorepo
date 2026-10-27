import type { KanjiDetail, KanjiSectionKind } from '@zenbu/dictionary-core/detail/kanji'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import type { StrokeOrderLabels } from '@zenbu/dictionary-core/detail/strokes'
import type { ReactNode } from 'react'
import { KanjiReadings } from './kanji-readings'
import { RomajiLine } from './reading-aid-lines'
import { RubyText } from './ruby-text'
import { StrokeOrder } from './stroke-order'
import type { RenderWordLink } from './word-link'

export interface ShownKanjiDetails extends Omit<KanjiDetail, 'components' | 'shareText'> {
  components: { character: string }[]
  strokeLabels: StrokeOrderLabels | null
}

export type LearnerPromptKind = Extract<KanjiSectionKind, 'lists' | 'notes'>

export interface KanjiDetailsProps {
  kanji: ShownKanjiDetails
  lang?: string
  text: { close: string }
  renderWordLink: RenderWordLink
  actions: ReactNode
  learnerPrompt: (kind: LearnerPromptKind) => ReactNode
}

function CharacterLink({
  character,
  renderWordLink
}: {
  character: string
  renderWordLink: RenderWordLink
}) {
  return (
    renderWordLink({
      target: { kanji: character },
      lang: 'ja',
      className: 'underline-offset-4 hover:underline',
      children: character
    }) ?? <span lang="ja">{character}</span>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function ElementDescription({
  element,
  lang
}: {
  element: ShownKanjiDetails['elements'][number]
  lang?: string
}) {
  return element.meanings.length > 0 ? (
    <p lang={lang}>{element.description}</p>
  ) : (
    <p>{element.description}</p>
  )
}

function KanjiDetailsPart({
  kind,
  kanji,
  lang,
  renderWordLink,
  learnerPrompt
}: Omit<KanjiDetailsProps, 'text' | 'actions'> & { kind: KanjiSectionKind }) {
  switch (kind) {
    case 'readings':
      return <KanjiReadings readings={kanji.readings} lang={lang} renderWordLink={renderWordLink} />
    case 'components':
      return (
        <p className="text-xl">
          {kanji.components.map((component, index) => (
            <span key={component.character}>
              {index > 0 ? ' · ' : null}
              <CharacterLink character={component.character} renderWordLink={renderWordLink} />
            </span>
          ))}
        </p>
      )
    case 'elements':
      return (
        <ul className="flex flex-col gap-3">
          {kanji.elements.map(element => (
            <li key={element.character} className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-muted text-3xl">
                <CharacterLink character={element.character} renderWordLink={renderWordLink} />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{element.roleLabel}</p>
                <ElementDescription element={element} lang={lang} />
              </div>
            </li>
          ))}
        </ul>
      )
    case 'lists':
    case 'notes':
      return learnerPrompt(kind)
    case 'words':
      return (
        <ul className="flex flex-col divide-y">
          {kanji.words.map(word => (
            <li key={word.entSeq} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
              {renderWordLink({
                target: { entSeq: word.entSeq },
                className: 'shrink-0 underline-offset-4 hover:underline',
                children: <KanjiWordText word={word} />
              }) ?? (
                <span className="shrink-0">
                  <KanjiWordText word={word} />
                </span>
              )}
              <span className="ml-auto text-right text-muted-foreground" lang={lang}>
                {word.summary}
              </span>
            </li>
          ))}
        </ul>
      )
  }
}

function KanjiWordText({ word }: { word: ShownKanjiDetails['words'][number] }) {
  return (
    <>
      <RubyText segments={word.ruby} className="text-xl" />
      <RomajiLine romaji={romaji(word.reading)} className="text-sm" />
    </>
  )
}

export function KanjiDetails({ kanji, text, actions, ...props }: KanjiDetailsProps) {
  return (
    <div className="flex flex-col gap-5" data-kanji-details={kanji.character}>
      <div className="flex items-start gap-4 sm:gap-6">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <span lang="ja" className="text-7xl leading-none">
            {kanji.character}
          </span>
          {kanji.strokeOrder && kanji.strokeLabels ? (
            <StrokeOrder order={kanji.strokeOrder} labels={kanji.strokeLabels} close={text.close} />
          ) : null}
        </div>
        <dl className="flex flex-1 flex-wrap justify-around gap-x-3 gap-y-2 self-center">
          {kanji.stats.map(stat => (
            <div key={stat.label} className="flex flex-col-reverse items-center">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className="shrink-0">{actions}</div>
      </div>
      {kanji.meanings.length > 0 ? (
        <p className="text-lg font-medium" lang={props.lang}>
          {kanji.meanings.join(', ')}
        </p>
      ) : null}

      {kanji.sections.map(section => (
        <Part key={section.kind} title={section.title}>
          <KanjiDetailsPart kind={section.kind} kanji={kanji} {...props} />
        </Part>
      ))}
    </div>
  )
}
