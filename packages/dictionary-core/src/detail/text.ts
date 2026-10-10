const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

export function graphemes(value: string): string[] {
  return everyUnitIsAGrapheme(value)
    ? value.split('')
    : Array.from(segmenter.segment(value), ({ segment }) => segment)
}

function isSingleUnitGrapheme(unit: number): boolean {
  return (
    (unit >= 0x20 && unit <= 0x7e) ||
    (unit >= 0x3000 &&
      unit <= 0x30ff &&
      !(unit >= 0x302a && unit <= 0x302f) &&
      unit !== 0x3099 &&
      unit !== 0x309a) ||
    (unit >= 0x4e00 && unit <= 0x9fff) ||
    (unit >= 0xff00 && unit <= 0xffef && unit !== 0xff9e && unit !== 0xff9f)
  )
}

export function everyUnitIsAGrapheme(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    if (!isSingleUnitGrapheme(value.charCodeAt(index))) return false
  }
  return true
}

export function graphemeCount(value: string): number {
  return everyUnitIsAGrapheme(value) ? value.length : graphemes(value).length
}

const codePoints = (value: string) => Array.from(value, scalar => scalar.codePointAt(0) ?? 0)

export function isCJKUnifiedIdeograph(character: string): boolean {
  return codePoints(character).some(code => code >= 0x3400 && code <= 0x9fff)
}

export function isKanjiCharacter(value: string): boolean {
  const scalars = codePoints(value)
  if (scalars.length !== 1) return false
  const [code] = scalars
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
