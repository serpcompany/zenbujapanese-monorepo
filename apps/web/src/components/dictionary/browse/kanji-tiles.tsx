import type { KanjiItem } from '@zenbu/dictionary-core/artifact/browse-kanji'
import Link from 'next/link'
import { kanjiSearchPath } from '@/lib/dictionary/urls'

export function KanjiTiles({
  characters,
  label
}: {
  characters: readonly string[]
  label: string
}) {
  return (
    <ul
      aria-label={label}
      lang="ja"
      className="grid grid-cols-5 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] sm:gap-1.5"
    >
      {characters.map(character => (
        <li key={character}>
          <Link
            href={kanjiSearchPath(character)}
            className="flex min-h-14 items-center justify-center rounded-lg border text-2xl hover:bg-muted sm:min-h-13"
          >
            {character}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function KanjiMeaningTiles({
  kanji,
  label
}: {
  kanji: readonly KanjiItem[]
  label: string
}) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]"
    >
      {kanji.map(({ character, meaning }) => (
        <li key={character}>
          <Link
            href={kanjiSearchPath(character)}
            className="flex h-full flex-col items-center gap-1 rounded-lg border px-2 py-3.5 text-center hover:bg-muted"
          >
            <span lang="ja" className="text-3xl leading-tight">
              {character}
            </span>
            <span className="text-xs text-muted-foreground">{meaning}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
