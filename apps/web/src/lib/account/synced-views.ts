import { isNoteWithoutAWord } from '@zenbu/account-rules/account-views'
import { rankedLists } from '@zenbu/dictionary-core/browse/lists'
import { defaultFrequencyPacks, frequencyFamily } from '@zenbu/dictionary-core/detail/frequency'
import { kanjiSearchPath, searchPath } from '@zenbu/dictionary-core/detail/links'
import type { Locale } from '../i18n/config'
import { coreText } from '../i18n/core-text'
import { fill, formatMoment } from '../i18n/format'
import { localizedPath } from '../i18n/paths'
import { type ItemPages, noItemPages } from './item-pages'
import type { AccountText } from './messages'
import { accountPages } from './pages'

type Data = Record<string, unknown>

export const textIn = (data: Data, field: string) =>
  typeof data[field] === 'string' ? (data[field] as string) : ''

const kanjiItem = 'kanji:'

export function itemPath(
  itemId: string,
  headword: string,
  locale: Locale,
  pages: ItemPages = noItemPages
): string | null {
  const page = pages.paths.get(itemId)
  if (page !== undefined) return localizedPath(page, locale)
  if (itemId.startsWith(kanjiItem)) return localizedPath(kanjiSearchPath(itemId.slice(6)), locale)
  return headword === '' ? null : localizedPath(searchPath(headword), locale)
}

export const hasNoWord = (itemId: string, pages: ItemPages) =>
  isNoteWithoutAWord(itemId) || pages.missing.has(itemId)

export function itemName(data: Data): string {
  const headword = textIn(data, 'headword') || textIn(data, 'itemId').replace(kanjiItem, '')
  const reading = textIn(data, 'reading')
  return reading === '' || reading === headword ? headword : `${headword}（${reading}）`
}

const folded = (text: string) => text.normalize('NFKC').toLowerCase()

export function matchesTyped(data: Data, typed: string): boolean {
  const query = folded(typed.trim())
  if (query === '') return true
  return [textIn(data, 'headword'), textIn(data, 'reading')].some(text =>
    folded(text).includes(query)
  )
}

export const shownMoment = (data: Data, field: string, locale: Locale) => {
  const moment = textIn(data, field)
  return moment === '' || Number.isNaN(Date.parse(moment)) ? '' : formatMoment(moment, locale)
}

export interface FrequencyPack {
  id: string
  name: string
}

export const frequencyPacks: readonly FrequencyPack[] = [
  ...defaultFrequencyPacks.map(({ id, name }) => ({ id, name })),
  ...rankedLists.flatMap(({ source, name }) =>
    source.kind === 'pack' ? [{ id: source.packId, name }] : []
  )
]

export function packName(id: string, locale: Locale, words: AccountText['synced']) {
  const pack = frequencyPacks.find(each => each.id === id)
  return pack ? coreText(pack.name, locale) : fill(words.settings.frequency.unknownPack, { id })
}

const minute = 60
const hour = 60 * minute

export function shownDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const [hours, minutes, rest] = [
    Math.floor(whole / hour),
    Math.floor((whole % hour) / minute),
    whole % minute
  ]
  const twoDigits = (value: number) => String(value).padStart(2, '0')
  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(rest)}`
    : `${minutes}:${twoDigits(rest)}`
}

export const listPath = (listId: string, locale: Locale) =>
  `${localizedPath(accountPages.lists.path, locale)}?list=${encodeURIComponent(listId)}`

export const youTubeVideo = (videoId: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`

type Words = AccountText['synced']['settings']

const groupsOf = (words: Words) =>
  words.names as unknown as Readonly<Record<string, Readonly<Record<string, string>> | undefined>>

export function settingName(name: string, words: Words): string {
  const [group = '', key = ''] = name.split('.')
  return groupsOf(words)[group]?.[key] ?? name
}

const sortedByFrequency = 'frequency|'

function languageName(tag: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

export function settingValue(name: string, value: unknown, locale: Locale, words: Words): string {
  const { values } = words
  if (typeof value === 'boolean') return value ? values.on : values.off
  if (typeof value === 'number') return fill(values.speed, { speed: value })
  const text = String(value)
  if (name === 'readingAids.translationLanguage') return languageName(text, locale)
  if (text.startsWith(sortedByFrequency)) {
    const family = text.slice(sortedByFrequency.length)
    const pack = frequencyPacks.find(each => frequencyFamily(each.id) === family)
    return fill(values.byFrequency, { name: pack ? coreText(pack.name, locale) : family })
  }
  const choices = values.choices as Readonly<Record<string, string | undefined>>
  return choices[text] ?? text
}
