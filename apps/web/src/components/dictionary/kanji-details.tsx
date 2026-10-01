import Link from 'next/link'
import type { ReactNode } from 'react'
import type { KanjiDetailsData } from '@/lib/dictionary/data'
import { KanjiReadings } from './kanji-readings'
import { RubyText } from './ruby-text'
import { StrokeOrder } from './stroke-order'

function CharacterLink({ character, path }: { character: string; path: string | null }) {
  return path ? (
    <Link href={path} lang="ja" className="underline-offset-4 hover:underline">
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

export function KanjiDetails({ kanji }: { kanji: KanjiDetailsData }) {
  return (
    <div className="flex flex-col gap-5" data-kanji-details={kanji.character}>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <span lang="ja" className="text-7xl leading-none">
            {kanji.character}
          </span>
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

      {kanji.readings.length > 0 ? (
        <Part title="Readings">
          <KanjiReadings readings={kanji.readings} />
        </Part>
      ) : null}

      {kanji.components.length > 0 ? (
        <Part title="Components">
          <p className="text-xl">
            {kanji.components.map((component, index) => (
              <span key={component.character}>
                {index > 0 ? ' · ' : null}
                <CharacterLink {...component} />
              </span>
            ))}
          </p>
        </Part>
      ) : null}

      {kanji.elements.length > 0 ? (
        <Part title="Elements">
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
        </Part>
      ) : null}

      {kanji.words.length > 0 ? (
        <Part title="Words">
          <ul className="flex flex-col divide-y">
            {kanji.words.map(word => (
              <li key={word.entSeq} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
                {word.path ? (
                  <Link href={word.path} className="underline-offset-4 hover:underline">
                    <RubyText segments={word.ruby} className="text-xl" />
                  </Link>
                ) : (
                  <RubyText segments={word.ruby} className="text-xl" />
                )}
                <span className="ml-auto text-right text-muted-foreground">{word.summary}</span>
              </li>
            ))}
          </ul>
        </Part>
      ) : null}
    </div>
  )
}
