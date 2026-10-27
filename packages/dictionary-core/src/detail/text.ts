const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

export function graphemes(value: string): string[] {
  return everyUnitIsAGrapheme(value)
    ? value.split('')
    : Array.from(segmenter.segment(value), ({ segment }) => segment)
}

const unitsThatAreGraphemes =
  /^[\x20-\x7e\u3000-\u3029\u3030-\u3098\u309b-\u30ff\u4e00-\u9fff\uff00-\uff9d\uffa0-\uffef]*$/

export function everyUnitIsAGrapheme(value: string): boolean {
  return unitsThatAreGraphemes.test(value)
}

const highSurrogate = /[\ud800-\udbff]/

export function scalarCount(value: string): number {
  return highSurrogate.test(value) ? Array.from(value).length : value.length
}

export function graphemeCount(value: string): number {
  return everyUnitIsAGrapheme(value) ? value.length : graphemes(value).length
}

export function isCJKUnifiedIdeograph(character: string): boolean {
  for (let index = 0; index < character.length; index++) {
    const unit = character.charCodeAt(index)
    if (unit >= 0x3400 && unit <= 0x9fff) return true
  }
  return false
}

export function isKanjiCharacter(value: string): boolean {
  const code = value.codePointAt(0)
  if (code === undefined || value.length !== (code > 0xffff ? 2 : 1)) return false
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x2fa1f) ||
    (code >= 0x30000 && code <= 0x323af)
  )
}

export function hiragana(value: string): string {
  return value.replace(/[ァ-ヶ]/gu, character =>
    String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60)
  )
}

export function katakana(value: string): string {
  return value.replace(/[ぁ-ゖ]/gu, character =>
    String.fromCodePoint((character.codePointAt(0) ?? 0) + 0x60)
  )
}

export function listedWithAnd(items: readonly string[]): string {
  return items.length <= 2
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

const glossLength = 18

export function shortGloss(meaning: string): string | null {
  const withoutNotes = meaning.replace(/\s*\([^)]*\)/gu, '')
  const first = withoutNotes.split(',').find(part => part !== '') ?? withoutNotes
  const trimmed = first.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, '')
  const gloss = trimmed.startsWith('to ') ? trimmed.slice(3) : trimmed
  if (!gloss) return null
  const shown = graphemes(gloss)
  return shown.length > glossLength ? `${shown.slice(0, glossLength - 1).join('')}…` : gloss
}

const placeholder = /\{(\w+)\}/g

export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(placeholder, (whole, name: string) =>
    name in values ? String(values[name]) : whole
  )
}

export function templateParts(template: string): { text: string; name?: string }[] {
  const parts: { text: string; name?: string }[] = []
  let last = 0
  for (const match of template.matchAll(placeholder)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: template.slice(last, index) })
    parts.push({ text: match[0], name: match[1] })
    last = index + match[0].length
  }
  if (last < template.length) parts.push({ text: template.slice(last) })
  return parts
}
