import { graphemeCount } from '../detail/text'
import { type Caption, continuesSentence } from './lines'

const maximumLinesPerCard = 2
const maximumCharactersPerCard = 40

interface Lines {
  first: number
  last: number
}

interface Span extends Lines {
  translation: string
}

function overlaps(line: Caption, translation: Caption): boolean {
  const overlap = Math.min(line.end, translation.end) - Math.max(line.start, translation.start)
  return overlap > 0 && (overlap >= 0.5 || overlap >= (line.end - line.start) / 2)
}

function joinedTranslation(joined: string, next: string): string {
  if (joined === '') return next
  const attaches = continuesSentence(next) || /^\p{P}/u.test(next)
  return joined + (attaches ? '' : ' ') + next
}

function inOrder(captions: readonly Caption[]): boolean {
  for (let index = 1; index < captions.length; index++) {
    const previous = captions[index - 1]
    const line = captions[index]
    if (!previous || !line || line.start < previous.start || line.end < previous.end) return false
  }
  return true
}

function firstEndingAfter(captions: readonly Caption[], time: number): number {
  let low = 0
  let high = captions.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((captions[middle]?.end ?? time) > time) high = middle
    else low = middle + 1
  }
  return low
}

function spans(captions: readonly Caption[], translations: readonly Caption[]): Span[] {
  const ordered = inOrder(captions)
  const found: Span[] = []
  for (const translation of translations) {
    let first = -1
    let last = -1
    let index = ordered ? firstEndingAfter(captions, translation.start) : 0
    for (; index < captions.length; index++) {
      const line = captions[index]
      if (!line || (ordered && line.start >= translation.end)) break
      if (!overlaps(line, translation)) continue
      if (first < 0) first = index
      last = index
    }
    if (first >= 0) found.push({ first, last, translation: translation.text })
  }
  return found
}

function cards(captions: readonly Caption[], spans: readonly Span[]): Lines[] {
  const characters = captions.map(line => graphemeCount(line.text))
  const fits = ({ first, last }: Lines) => {
    if (last - first + 1 > maximumLinesPerCard) return false
    let count = 0
    for (let index = first; index <= last; index++) count += characters[index] ?? 0
    return count <= maximumCharactersPerCard
  }
  const groups: Lines[] = []
  for (const span of [...spans].sort((left, right) => left.first - right.first)) {
    if (!fits(span)) continue
    const previous = groups[groups.length - 1]
    if (!previous || span.first > previous.last) {
      groups.push({ first: span.first, last: span.last })
      continue
    }
    const merged = { first: previous.first, last: Math.max(previous.last, span.last) }
    const rest = { first: previous.last + 1, last: span.last }
    if (fits(merged)) groups[groups.length - 1] = merged
    else if (span.last > previous.last && fits(rest)) groups.push(rest)
  }
  return groups
}

export function pairedCaptions(
  captions: readonly Caption[],
  translations: readonly Caption[]
): Caption[] {
  if (captions.length === 0 || translations.length === 0) return [...captions]
  const translated = spans(captions, translations)
  const groups = cards(captions, translated)
  const cardOf: number[] = []
  const texts: string[] = []
  const bounds: Lines[] = []
  let group = 0
  for (let index = 0; index < captions.length; ) {
    while ((groups[group]?.last ?? captions.length) < index) group++
    const current = groups[group]
    const last = current && current.first <= index ? current.last : index
    let text = ''
    for (let line = index; line <= last; line++) {
      cardOf[line] = bounds.length
      text += captions[line]?.text ?? ''
    }
    texts.push(text)
    bounds.push({ first: index, last })
    index = last + 1
  }
  const joined = bounds.map(() => '')
  for (const span of translated) {
    const card = cardOf[span.last] ?? 0
    joined[card] = joinedTranslation(joined[card] ?? '', span.translation)
  }
  return bounds.map(({ first, last }, id) => ({
    id,
    start: captions[first]?.start ?? 0,
    end: captions[last]?.end ?? 0,
    text: texts[id] ?? '',
    translation: joined[id] || null
  }))
}
