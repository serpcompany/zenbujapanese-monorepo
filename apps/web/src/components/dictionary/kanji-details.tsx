import type { KanjiSectionKind } from '@zenbu/dictionary-core/detail/kanji'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { KanjiDetailsData } from '@/lib/dictionary/kanji-details'
import { strokeLabelsIn } from '@/lib/dictionary/screen-text'
import { kanjiSearchPath } from '@/lib/dictionary/urls'
import { type Locale, sourceLang } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { KanjiReadings } from './kanji-readings'
import { LearnerPrompt } from './learner-prompt'
import { RomajiLine } from './reading-aid-lines'
import { RubyText } from './ruby-text'
import { SavedItemActions } from './saved-item-actions'
import { StrokeOrder } from './stroke-order'

function CharacterLink({
  character,
  path,
  locale
}: {
  character: string
  path: string | null
  locale: Locale
}) {
  return path ? (
    <Link
      href={localizedPath(path, locale)}
      lang="ja"
      className="underline-offset-4 hover:underline"
    >
      {character}
    </Link>
  ) : (
    <span lang="ja">{character}</span>
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
  locale
}: {
  element: KanjiDetailsData['elements'][number]
  locale: Locale
}) {
  return element.meanings.length > 0 ? (
    <p lang={sourceLang(locale)}>{element.description}</p>
  ) : (
    <p>{coreText(element.description, locale)}</p>
  )
}

function KanjiDetailsPart({
  kind,
  kanji,
  locale
}: {
  kind: KanjiSectionKind
  kanji: KanjiDetailsData
  locale: Locale
}) {
  switch (kind) {
    case 'readings':
      return <KanjiReadings readings={kanji.readings} locale={locale} />
    case 'components':
      return (
        <p className="text-xl">
          {kanji.components.map((component, index) => (
            <span key={component.character}>
              {index > 0 ? ' · ' : null}
              <CharacterLink {...component} locale={locale} />
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
                <CharacterLink character={element.character} path={element.path} locale={locale} />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {coreText(element.roleLabel, locale)}
                </p>
                <ElementDescription element={element} locale={locale} />
              </div>
            </li>
          ))}
        </ul>
      )
    case 'lists':
    case 'notes':
      return <LearnerPrompt kind={kind} locale={locale} text={getDictionary(locale).learner} />
    case 'words':
      return (
        <ul className="flex flex-col divide-y">
          {kanji.words.map(word => (
            <li key={word.entSeq} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
              {word.path ? (
                <Link
                  href={localizedPath(word.path, locale)}
                  className="shrink-0 underline-offset-4 hover:underline"
                >
                  <RubyText segments={word.ruby} className="text-xl" />
                  <RomajiLine romaji={romaji(word.reading)} className="text-sm" />
                </Link>
              ) : (
                <span className="shrink-0">
                  <RubyText segments={word.ruby} className="text-xl" />
                  <RomajiLine romaji={romaji(word.reading)} className="text-sm" />
                </span>
              )}
              <span className="ml-auto text-right text-muted-foreground" lang={sourceLang(locale)}>
                {word.summary}
              </span>
            </li>
          ))}
        </ul>
      )
  }
}

export function KanjiDetails({ kanji, locale }: { kanji: KanjiDetailsData; locale: Locale }) {
  const t = getDictionary(locale)
  return (
    <div className="flex flex-col gap-5" data-kanji-details={kanji.character}>
      <div className="flex items-start gap-4 sm:gap-6">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <span lang="ja" className="text-7xl leading-none">
            {kanji.character}
          </span>
          {kanji.strokeOrder ? (
            <StrokeOrder
              order={kanji.strokeOrder}
              labels={strokeLabelsIn(kanji.character, kanji.strokeOrder.strokes.length, locale)}
              close={t.chrome.close}
            />
          ) : null}
        </div>
        <dl className="flex flex-1 flex-wrap justify-around gap-x-3 gap-y-2 self-center">
          {kanji.stats.map(stat => (
            <div key={stat.label} className="flex flex-col-reverse items-center">
              <dt className="text-xs text-muted-foreground">{coreText(stat.label, locale)}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className="shrink-0">
          <SavedItemActions
            title={kanji.character}
            shareText={kanji.shareText}
            path={localizedPath(kanjiSearchPath(kanji.character), locale)}
            name={kanji.character}
            locale={locale}
            text={t.learner}
          />
        </div>
      </div>
      {kanji.meanings.length > 0 ? (
        <p className="text-lg font-medium" lang={sourceLang(locale)}>
          {kanji.meanings.join(', ')}
        </p>
      ) : null}

      {kanji.sections.map(section => (
        <Part key={section.kind} title={coreText(section.title, locale)}>
          <KanjiDetailsPart kind={section.kind} kanji={kanji} locale={locale} />
        </Part>
      ))}
    </div>
  )
}
