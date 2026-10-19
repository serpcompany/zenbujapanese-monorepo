import type { Locale } from './i18n/config'
import { getDictionary } from './i18n/dictionary'
import { fill } from './i18n/format'
import { site } from './site'

export const descriptionLength = { shortest: 110, longest: 160 } as const

export const longestTitle = 70

const ellipsis = '…'
const breakCharacter = /^[\s,、]$/u
const trailingBreaks = /[\s,、]+$/u

export const characters = (text: string) => Array.from(text).length

export const siteTitle = (title: string) => `${title} | ${site.name}`

export const fitsTitle = (title: string) => characters(siteTitle(title)) <= longestTitle

export function shortened(text: string, longest: number = descriptionLength.longest): string {
  const points = Array.from(text)
  if (points.length <= longest) return text
  const lastBreak = points.slice(0, longest).findLastIndex(point => breakCharacter.test(point))
  const kept = lastBreak > longest / 2 ? points.slice(0, lastBreak) : points.slice(0, longest - 1)
  return `${kept.join('').replace(trailingBreaks, '')}${ellipsis}`
}

export function fittedTitle(template: string, name: string, text: string): string {
  const room = longestTitle - characters(siteTitle(fill(template, { [name]: '' })))
  return fill(template, { [name]: shortened(text, room) })
}

export function joinedSentences(
  sentences: readonly (string | null | undefined)[],
  locale: Locale
): string {
  const template = getDictionary(locale).site.sentences
  const [first = '', ...rest] = sentences.filter((sentence): sentence is string =>
    Boolean(sentence)
  )
  return rest.reduce((joined, second) => fill(template, { first: joined, second }), first)
}

export type MoreText = string | readonly string[] | null | undefined

export function fittedDescription(lead: string, more: readonly MoreText[], locale: Locale) {
  const closing = getDictionary(locale).site.closing
  return [...more, closing].reduce<string>((description, addition) => {
    if (!addition || characters(description) >= descriptionLength.shortest) return description
    const alternatives = typeof addition === 'string' ? [addition] : addition
    return (
      alternatives
        .map(alternative => joinedSentences([description, alternative], locale))
        .find(joined => characters(joined) <= descriptionLength.longest) ?? description
    )
  }, shortened(lead))
}
