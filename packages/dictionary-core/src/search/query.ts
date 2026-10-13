import { everyUnitIsAGrapheme } from '../detail/text'

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

export function graphemes(value: string): string[] {
  return everyUnitIsAGrapheme(value)
    ? value.split('')
    : Array.from(graphemeSegmenter.segment(value), segment => segment.segment)
}

function compareScalars(lhs: string, rhs: string): number {
  const left = Array.from(lhs)
  const right = Array.from(rhs)
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = (left[index].codePointAt(0) ?? 0) - (right[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

const isSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdfff

export function compareStrings(lhs: string, rhs: string): number {
  const length = Math.min(lhs.length, rhs.length)
  for (let index = 0; index < length; index++) {
    const left = lhs.charCodeAt(index)
    const right = rhs.charCodeAt(index)
    if (left === right) continue
    return isSurrogate(left) || isSurrogate(right) ? compareScalars(lhs, rhs) : left - right
  }
  return lhs.length - rhs.length
}

const wordSeparator = /[\p{White_Space}\u{FEFF}]/u

function withoutMarksASpaceCarries(word: string): string {
  return graphemes(` ${word}`).slice(1).join('')
}

export function normalizeQuery(raw: string): string {
  const folded = raw.normalize('NFKC').toLowerCase()
  if (!wordSeparator.test(folded)) return folded
  if (everyUnitIsAGrapheme(folded)) return folded.split(' ').filter(Boolean).join(' ')
  const [first, ...afterASeparator] = folded.split(wordSeparator)
  return [first, ...afterASeparator.map(withoutMarksASpaceCarries)].filter(Boolean).join(' ')
}

export function isASCII(value: string): boolean {
  return !/[\u0080-\uffff]/.test(value)
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

const japaneseScalars = /^[\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+$/

export function isJapaneseOnly(value: string): boolean {
  return japaneseScalars.test(value) && normalizeQuery(value) === value
}

export function japaneseCandidates(candidates: readonly string[]): string[] {
  const kept = new Set<string>()
  for (const candidate of candidates) {
    const query = normalizeQuery(candidate)
    if (isJapaneseOnly(query)) kept.add(query)
  }
  return [...kept]
}

export function isMixedScript(value: string): boolean {
  return japaneseSegments(value).length > 0 && /[a-z]/i.test(value)
}

const irregularDictionaryForms = new Map([
  ['shita', 'suru'],
  ['shite', 'suru'],
  ['kita', 'kuru'],
  ['kite', 'kuru'],
  ['itta', 'iku'],
  ['itte', 'iku']
])

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

  const irregular = irregularDictionaryForms.get(value)
  if (irregular) append(irregular)

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

export function literalQuery(value: string): string {
  return literalReplacements[value] ?? value
}
