// Ports apps/ios/Modules/Sources/SearchExperience/SearchQuery.swift.

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

/** Swift's `String.count`: grapheme clusters, not UTF-16 code units. */
export function graphemes(value: string): string[] {
  return Array.from(graphemeSegmenter.segment(value), segment => segment.segment)
}

/** Swift's `String <`: compares by Unicode scalar, not UTF-16 code unit. */
export function compareStrings(lhs: string, rhs: string): number {
  const left = Array.from(lhs)
  const right = Array.from(rhs)
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = (left[index].codePointAt(0) ?? 0) - (right[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

/** Compatibility-composed, lowercased, and with whitespace runs collapsed to one space. */
export function normalizeQuery(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().split(/\s+/u).filter(Boolean).join(' ')
}

export function isASCII(value: string): boolean {
  return Array.from(value).every(character => (character.codePointAt(0) ?? 0) < 0x80)
}

function isJapaneseScalar(codePoint: number): boolean {
  return (
    codePoint === 0x3005 ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff)
  )
}

export function japaneseSegments(value: string): string[] {
  const segments: string[] = []
  let current = ''
  for (const character of graphemes(value)) {
    if (Array.from(character).every(scalar => isJapaneseScalar(scalar.codePointAt(0) ?? 0))) {
      current += character
    } else if (current) {
      segments.push(current)
      current = ''
    }
  }
  if (current) segments.push(current)
  return segments.map(normalizeQuery)
}

export function isJapaneseOnly(value: string): boolean {
  const segments = japaneseSegments(value)
  return value !== '' && segments.length === 1 && segments[0] === value
}

export function isMixedScript(value: string): boolean {
  return japaneseSegments(value).length > 0 && /[a-z]/i.test(value)
}

/** Dictionary-form candidates for an inflected romaji query, such as tabeta → taberu. */
export function romajiDeinflectedCandidates(value: string): string[] {
  if (!isASCII(value)) return []
  const candidates: string[] = []
  const append = (candidate: string) => {
    const query = normalizeQuery(candidate)
    if (query !== value && !candidates.includes(query)) candidates.push(query)
  }
  const replaceSuffix = (suffix: string, endings: string[]) => {
    if (!value.endsWith(suffix) || value.length <= suffix.length) return
    const stem = value.slice(0, -suffix.length)
    for (const ending of endings) append(stem + ending)
  }

  // Irregulars first: their regular-looking alternatives are valid words too.
  if (value === 'shita' || value === 'shite') append('suru')
  if (value === 'kita' || value === 'kite') append('kuru')
  if (value === 'itta' || value === 'itte') append('iku')

  replaceSuffix('shita', ['su'])
  replaceSuffix('shite', ['su'])
  replaceSuffix('tta', ['u', 'tsu', 'ru'])
  replaceSuffix('tte', ['u', 'tsu', 'ru'])
  replaceSuffix('nda', ['mu', 'bu', 'nu'])
  replaceSuffix('nde', ['mu', 'bu', 'nu'])
  replaceSuffix('ita', ['ku'])
  replaceSuffix('ite', ['ku'])
  replaceSuffix('ida', ['gu'])
  replaceSuffix('ide', ['gu'])
  replaceSuffix('sete', ['seru', 'su'])
  replaceSuffix('ta', ['ru'])
  replaceSuffix('te', ['ru'])
  return candidates
}

const literalReplacements: Record<string, string> = { mondai: 'monday' }

/** The app's reference-compatible literal query policy. */
export function literalQuery(value: string): string {
  return literalReplacements[value] ?? value
}
