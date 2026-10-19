import type { SearchData } from '@/lib/dictionary/data'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill, formatNumber, pluralOf } from '@/lib/i18n/format'
import { capitalized, fitsTitle, fittedDescription } from '@/lib/snippets'
import { plainRomaji, spellsReading } from './plain-romaji'

export interface SnippetSearch {
  query: string
  english: boolean
  words: readonly { headword: string; reading: string }[]
  hasExamples: boolean
}

export interface SearchSnippet {
  title: string
  heading: string
  description: string
}

export const showsExampleSentences = (data: SearchData) =>
  data.state === 'results' && data.examples?.target.kind === 'inline'

const smallWords = new Set('a an and as at by for in of on or the to with'.split(' '))

const searchText = (locale: Locale) => getDictionary(locale).search.metadata

const titleCased = (query: string) =>
  query
    .split(' ')
    .map(word => (smallWords.has(word) ? word : capitalized(word)))
    .join(' ')

function queryIn(locale: Locale, query: string, place: 'title' | 'sentence') {
  if (locale !== 'en') return query
  return place === 'title' ? titleCased(query) : capitalized(query)
}

function spelled(word: SnippetSearch['words'][number], locale: Locale, spellings: string[]) {
  const shown = spellings.filter(spelling => spelling !== word.headword)
  return shown.length === 0
    ? word.headword
    : fill(searchText(locale).spelled, { headword: word.headword, spelling: shown.join(', ') })
}

function englishSpellings(
  word: SnippetSearch['words'][number],
  locale: Locale,
  withReading: boolean
) {
  const latin = locale === 'en' ? plainRomaji(word.reading) : null
  if (!withReading && latin) return [latin]
  return [word.reading, ...(latin ? [latin] : [])]
}

const firstFitting = (titles: string[]) => titles.find(fitsTitle) ?? titles[titles.length - 1]

function answeredTitle(search: SnippetSearch, locale: Locale) {
  const t = searchText(locale)
  const [word] = search.words
  const asked = fill(t.howToSay, { query: queryIn(locale, search.query, 'title') })
  const titles = [
    fill(t.answered, {
      title: asked,
      word: spelled(word, locale, englishSpellings(word, locale, false))
    }),
    fill(t.answered, { title: asked, word: word.headword }),
    asked,
    fill(t.titleForEnglish, { query: search.query })
  ]
  return firstFitting(
    search.hasExamples ? titles.map(title => fill(t.withExamples, { title })) : titles
  )
}

function answeredSnippet(search: SnippetSearch, locale: Locale): SearchSnippet {
  const t = searchText(locale)
  const [word, ...others] = search.words
  const full = spelled(word, locale, englishSpellings(word, locale, true))
  const lead = fill(t.answer, { query: queryIn(locale, search.query, 'sentence'), word: full })
  const otherWords =
    others.length > 0
      ? fill(pluralOf(t.otherWords, others.length, locale), {
          count: formatNumber(others.length, locale),
          query: search.query
        })
      : fill(t.onlyWord, { query: search.query })
  return {
    title: answeredTitle(search, locale),
    heading: fill(t.wordFor, { query: queryIn(locale, search.query, 'title'), word: full }),
    description: fittedDescription(lead, [otherWords, [t.more, t.moreShort]], locale)
  }
}

export function searchSnippet(search: SnippetSearch, locale: Locale): SearchSnippet {
  const [top] = search.words
  if (search.english && top && !spellsReading(search.query, top.reading)) {
    return answeredSnippet(search, locale)
  }
  const t = searchText(locale)
  const title = fill(search.english ? t.titleForEnglish : t.titleForJapanese, {
    query: search.query
  })
  const found = search.words.length > 0
  const lead = found
    ? fill(search.english ? t.descriptionForEnglish : t.descriptionForJapanese, {
        query: search.query,
        count: formatNumber(search.words.length, locale)
      })
    : fill(t.noResults, { query: search.query })
  return {
    title,
    heading: title,
    description: fittedDescription(lead, found ? [t.more] : [], locale)
  }
}
