import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { searchPath } from './urls'

export const radicalsPath = '/dictionary/radicals.json'

const inputParameter = 'input'
const radicalsInput = 'radicals'
const closedSectionsKey = 'search.radicals.closed-sections'

export function pickedKanjiPath(boxText: string, kanji: string): string {
  return `${searchPath(normalizeQuery(boxText + kanji))}?${inputParameter}=${radicalsInput}`
}

export function startedFromRadicals(
  searchParams: Readonly<Record<string, string | string[] | undefined>>
): boolean {
  return searchParams[inputParameter] === radicalsInput
}

export const strokeSection = (strokeCount: number) => `strokes-${strokeCount}`

export function closedRadicalSections(): string[] {
  try {
    return (window.localStorage.getItem(closedSectionsKey) ?? '').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export function keepClosedRadicalSections(sections: readonly string[]): void {
  try {
    window.localStorage.setItem(closedSectionsKey, [...sections].sort().join('\n'))
  } catch {
    return
  }
}
